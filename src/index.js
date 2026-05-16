#!/usr/bin/env node

const { exec, execSync } = require('child_process');
const inquirer = require('inquirer').default;
const { Separator } = inquirer;

const c = {
  red:    s => `\x1b[31m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  gray:   s => `\x1b[90m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};
const Table = require('cli-table3');
const os = require('os');
const path = require('path');

const DEFAULT_CONFIG = {
  thresholds: {
    sleepingCpu: 1,      // CPU% 미만이면 Sleeping
    workingCpu: 5,       // CPU% 초과이면 Working
    highMemoryMB: 100,   // MB 이상이면 고메모리
    oldSessionHours: 24  // 시간 이상이면 오래된 세션
  }
};

class ClaudeSessionManager {
  constructor(config = {}) {
    this.sessions = [];
    this.totalMemory = 0;
    this.config = {
      thresholds: { ...DEFAULT_CONFIG.thresholds, ...config.thresholds }
    };
  }

  // Claude 프로세스 목록 가져오기
  async getClaudeSessions() {
    this.totalMemory = 0; // US-001: 매 호출마다 초기화
    return new Promise((resolve, reject) => {
      exec("ps aux | grep -E '/claude.*--resume|^.*claude$' | grep -v grep | grep -v 'claude_session_manager'",
        (error, stdout, stderr) => {
          if (error && stdout === '') {
            resolve([]);
            return;
          }

          const lines = stdout.trim().split('\n').filter(line => line);
          const sessions = lines.map((line, index) => {
            const parts = line.split(/\s+/);
            const pid = parts[1];
            const cpu = parseFloat(parts[2]);
            const mem = parseFloat(parts[3]);
            const rss = parseInt(parts[5]);
            const memMB = Math.round(rss / 1024);

            // US-003: 실제 프로세스 시작 시각 조회
            const startTime = this.getProcessStartTime(pid);

            // 세션 ID 추출
            const sessionMatch = line.match(/resume ([a-f0-9-]+)/);
            const sessionId = sessionMatch ? sessionMatch[1].substring(0, 8) :
                            (line.includes('claude$') ? 'ACTIVE' : 'NO_ID');

            // 프로젝트 이름 추출 (작업 디렉토리에서)
            const cwd = this.getWorkingDirectory(pid);
            const project = this.getProjectName(cwd);

            // 상태 결정
            const { sleepingCpu, workingCpu } = this.config.thresholds;
            let status = 'Sleeping';
            let statusColor = c.gray;
            if (cpu > workingCpu) {
              status = 'Working';
              statusColor = c.green;
            } else if (cpu > sleepingCpu) {
              status = 'Idle';
              statusColor = c.yellow;
            }

            this.totalMemory += memMB;

            return {
              index: index + 1,
              pid,
              sessionId,
              cpu,
              mem,
              memMB,
              startTime,
              project,
              status,
              statusColor,
              cwd
            };
          });

          resolve(sessions);
        }
      );
    });
  }

  // US-003: 프로세스 실제 시작 시각 조회
  getProcessStartTime(pid) {
    try {
      const result = execSync(`ps -p ${pid} -o lstart= 2>/dev/null`, { encoding: 'utf8' });
      return result.trim() || '-';
    } catch (e) {
      return '-';
    }
  }

  // 프로세스 작업 디렉토리 가져오기
  getWorkingDirectory(pid) {
    try {
      const result = execSync(`lsof -p ${pid} 2>/dev/null | grep "cwd" | awk '{print $NF}'`,
        { encoding: 'utf8' });
      return result.trim() || os.homedir();
    } catch (e) {
      return os.homedir();
    }
  }

  // 프로젝트 이름 추출
  getProjectName(cwd) {
    if (cwd === os.homedir()) {
      return '~';
    }
    return path.basename(cwd) || '/';
  }

  // 세션 테이블 표시
  displaySessions(sessions) {
    console.clear();
    console.log(c.cyan('╔════════════════════════════════════════════════════════════════════════╗'));
    console.log(c.cyan('║') + c.bold('    Claude Code Session Manager v1.1                                   ') + c.cyan('║'));
    console.log(c.cyan('╚════════════════════════════════════════════════════════════════════════╝'));
    console.log();

    const table = new Table({
      head: [
        c.bold('No.'),
        c.bold('PID'),
        c.bold('Project'),
        c.bold('CPU%'),
        c.bold('MEM'),
        c.bold('Start'),
        c.bold('Status')
      ],
      style: {
        head: [],
        border: []
      }
    });

    sessions.forEach(session => {
      const { workingCpu, highMemoryMB } = this.config.thresholds;
      const cpuColor = session.cpu > workingCpu * 2 ? c.red :
                      session.cpu > workingCpu ? c.yellow :
                      c.gray;

      const memColor = session.memMB > highMemoryMB ? c.red :
                       session.memMB > highMemoryMB / 2 ? c.yellow :
                       c.gray;

      const projectColor = session.project === '~' ? c.dim : c.cyan;

      table.push([
        `[${session.index}]`,
        session.pid,
        projectColor(session.project),
        cpuColor(`${session.cpu}%`),
        memColor(`${session.memMB}MB`),
        session.startTime,
        session.statusColor(session.status)
      ]);
    });

    console.log(table.toString());
    console.log();
    console.log(`총 ${c.bold(sessions.length)}개의 세션 | 메모리 사용: ${c.bold(this.totalMemory + 'MB')}`);
    console.log();
  }

  // 세션 종료
  async killSession(pid, project) {
    return new Promise((resolve) => {
      exec(`kill -TERM ${pid}`, (error) => {
        if (!error) {
          console.log(c.green(`✓ PID ${pid} (${c.cyan(project)}) 종료됨`));
          resolve(true);
        } else {
          exec(`kill -KILL ${pid}`, (error2) => {
            if (!error2) {
              console.log(c.green(`✓ PID ${pid} (${c.cyan(project)}) 강제 종료됨`));
              resolve(true);
            } else {
              console.log(c.red(`✗ PID ${pid} 종료 실패`));
              resolve(false);
            }
          });
        }
      });
    });
  }

  // Sleeping 세션 종료
  async killSleepingSessions(sessions) {
    const sleepingSessions = sessions.filter(s => s.status === 'Sleeping');

    if (sleepingSessions.length === 0) {
      console.log(c.yellow('종료할 Sleeping 세션이 없습니다.'));
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `${sleepingSessions.length}개의 Sleeping 세션을 종료하시겠습니까?`,
      default: false
    }]);

    if (confirm) {
      let killed = 0;
      for (const session of sleepingSessions) {
        if (await this.killSession(session.pid, session.project)) {
          killed++;
        }
      }
      console.log(c.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // 오래된 세션 종료
  async killOldSessions(sessions) {
    const oldSessions = [];
    const now = Date.now();

    for (const session of sessions) {
      try {
        const startTime = new Date(session.startTime);
        if (isNaN(startTime.getTime())) continue;
        const diff = now - startTime.getTime();
        const hours = diff / (1000 * 60 * 60);

        if (hours > this.config.thresholds.oldSessionHours) {
          oldSessions.push({ ...session, hours: Math.round(hours) });
        }
      } catch (e) {
        console.warn(c.dim(`PID ${session.pid} 시작 시각 파싱 실패`));
      }
    }

    if (oldSessions.length === 0) {
      console.log(c.yellow(`${this.config.thresholds.oldSessionHours}시간 이상 된 세션이 없습니다.`));
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `${oldSessions.length}개의 오래된 세션을 종료하시겠습니까?`,
      default: false
    }]);

    if (confirm) {
      let killed = 0;
      for (const session of oldSessions) {
        console.log(c.dim(`${session.hours}시간 경과: ${session.project}`));
        if (await this.killSession(session.pid, session.project)) {
          killed++;
        }
      }
      console.log(c.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // US-005: 메인 메뉴 (재귀 → while 루프)
  async showMainMenu() {
    let running = true;

    while (running) {
      this.sessions = await this.getClaudeSessions();
      this.displaySessions(this.sessions);

      if (this.sessions.length === 0) {
        console.log(c.yellow('실행 중인 Claude 세션이 없습니다.'));
        return;
      }

      const choices = [
        { name: '특정 세션 종료', value: 'kill_specific' },
        { name: '모든 Sleeping 세션 종료', value: 'kill_sleeping' },
        { name: `메모리 ${this.config.thresholds.highMemoryMB}MB 이상 세션 종료`, value: 'kill_high_memory' },
        { name: `${this.config.thresholds.oldSessionHours}시간 이상 오래된 세션 종료`, value: 'kill_old' },
        new Separator(),
        { name: '새로고침', value: 'refresh' },
        { name: '종료', value: 'quit' }
      ];

      const { action } = await inquirer.prompt([{
        type: 'list',
        name: 'action',
        message: '선택:',
        choices
      }]);

      if (action === 'quit') {
        console.log(c.green('프로그램을 종료합니다.'));
        process.exit(0);
      }

      if (action === 'refresh') {
        continue;
      }

      switch (action) {
        case 'kill_specific':
          await this.killSpecificSession();
          break;
        case 'kill_sleeping':
          await this.killSleepingSessions(this.sessions);
          break;
        case 'kill_high_memory':
          await this.killHighMemorySessions();
          break;
        case 'kill_old':
          await this.killOldSessions(this.sessions);
          break;
      }

      const { cont } = await inquirer.prompt([{
        type: 'confirm',
        name: 'cont',
        message: '계속하시겠습니까?',
        default: true
      }]);

      if (!cont) {
        running = false;
      }
    }
  }

  // 특정 세션 종료
  async killSpecificSession() {
    const choices = this.sessions.map(s => ({
      name: `[${s.pid}] ${c.cyan(s.project)} - ${s.statusColor(s.status)} (${s.cpu}% CPU, ${s.memMB}MB)`,
      value: s
    }));

    const { session } = await inquirer.prompt([{
      type: 'list',
      name: 'session',
      message: '종료할 세션 선택:',
      choices: [...choices, new Separator(), { name: '취소', value: null }]
    }]);

    if (session) {
      await this.killSession(session.pid, session.project);
    }
  }

  // 높은 메모리 세션 종료
  async killHighMemorySessions() {
    const highMemSessions = this.sessions.filter(s => s.memMB > this.config.thresholds.highMemoryMB);

    if (highMemSessions.length === 0) {
      console.log(c.yellow(`메모리 ${this.config.thresholds.highMemoryMB}MB 이상인 세션이 없습니다.`));
      return;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `${highMemSessions.length}개의 높은 메모리 세션을 종료하시겠습니까?`,
      default: false
    }]);

    if (confirm) {
      let killed = 0;
      for (const session of highMemSessions) {
        console.log(c.dim(`${session.memMB}MB: ${session.project}`));
        if (await this.killSession(session.pid, session.project)) {
          killed++;
        }
      }
      console.log(c.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // 통계 표시
  async showStats() {
    this.sessions = await this.getClaudeSessions();

    console.clear();
    console.log(c.cyan(c.bold('\n Claude Code 세션 통계\n')));

    const stats = {
      total: this.sessions.length,
      working: this.sessions.filter(s => s.status === 'Working').length,
      idle: this.sessions.filter(s => s.status === 'Idle').length,
      sleeping: this.sessions.filter(s => s.status === 'Sleeping').length,
      totalMemory: this.totalMemory,
      avgMemory: this.sessions.length > 0 ? Math.round(this.totalMemory / this.sessions.length) : 0
    };

    const table = new Table();
    table.push(
      ['총 세션 수', c.bold(stats.total)],
      ['Working', c.green(stats.working)],
      ['Idle', c.yellow(stats.idle)],
      ['Sleeping', c.gray(stats.sleeping)],
      ['총 메모리', c.bold(stats.totalMemory + 'MB')],
      ['평균 메모리', stats.avgMemory + 'MB']
    );

    console.log(table.toString());
  }
}

// CLI 명령어 처리
async function main() {
  const manager = new ClaudeSessionManager();
  const args = process.argv.slice(2);
  const command = args[0];

  // US-002: 각 case를 블록으로 분리하여 const 스코프 오류 방지
  switch (command) {
    case 'kill-sleeping':
    case 'ks': {
      const sessions = await manager.getClaudeSessions();
      await manager.killSleepingSessions(sessions);
      break;
    }
    case 'kill-old':
    case 'ko': {
      const oldSessions = await manager.getClaudeSessions();
      await manager.killOldSessions(oldSessions);
      break;
    }
    case 'stats':
    case 'session-stats':
      await manager.showStats();
      break;

    default:
      await manager.showMainMenu();
  }
}

// 에러 처리
process.on('uncaughtException', (err) => {
  console.error(c.red('오류 발생:'), err.message);
  process.exit(1);
});

// Ctrl+C / Ctrl+D 정상 종료
process.on('SIGINT', () => {
  console.log(c.green('\n프로그램을 종료합니다.'));
  process.exit(0);
});

// 실행
if (require.main === module) {
  main().catch(err => {
    console.error(c.red('실행 오류:'), err);
    process.exit(1);
  });
}

module.exports = ClaudeSessionManager;
