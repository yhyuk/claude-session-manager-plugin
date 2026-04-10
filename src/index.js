#!/usr/bin/env node

const { exec, execSync } = require('child_process');
const chalk = require('chalk');
const inquirer = require('inquirer');
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
            const startTime = parts[8];
            const memMB = Math.round(rss / 1024);

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
            let statusColor = chalk.gray;
            if (cpu > workingCpu) {
              status = 'Working';
              statusColor = chalk.green;
            } else if (cpu > sleepingCpu) {
              status = 'Idle';
              statusColor = chalk.yellow;
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
    console.log(chalk.cyan('╔════════════════════════════════════════════════════════════════════════╗'));
    console.log(chalk.cyan('║') + chalk.bold('    Claude Code Session Manager v1.0                                   ') + chalk.cyan('║'));
    console.log(chalk.cyan('╚════════════════════════════════════════════════════════════════════════╝'));
    console.log();

    const table = new Table({
      head: [
        chalk.bold('No.'),
        chalk.bold('PID'),
        chalk.bold('Project'),
        chalk.bold('CPU%'),
        chalk.bold('MEM'),
        chalk.bold('Start'),
        chalk.bold('Status')
      ],
      style: {
        head: [],
        border: []
      }
    });

    sessions.forEach(session => {
      const { workingCpu, highMemoryMB } = this.config.thresholds;
      const cpuColor = session.cpu > workingCpu * 2 ? chalk.red :
                      session.cpu > workingCpu ? chalk.yellow :
                      chalk.gray;

      const memColor = session.memMB > highMemoryMB ? chalk.red :
                       session.memMB > highMemoryMB / 2 ? chalk.yellow :
                       chalk.gray;

      const projectColor = session.project === '~' ? chalk.dim : chalk.cyan;

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
    console.log(`총 ${chalk.bold(sessions.length)}개의 세션 | 메모리 사용: ${chalk.bold(this.totalMemory + 'MB')}`);
    console.log();
  }

  // 세션 종료
  async killSession(pid, project) {
    return new Promise((resolve) => {
      exec(`kill -TERM ${pid}`, (error) => {
        if (!error) {
          console.log(chalk.green(`✓ PID ${pid} (${chalk.cyan(project)}) 종료됨`));
          resolve(true);
        } else {
          exec(`kill -KILL ${pid}`, (error2) => {
            if (!error2) {
              console.log(chalk.green(`✓ PID ${pid} (${chalk.cyan(project)}) 강제 종료됨`));
              resolve(true);
            } else {
              console.log(chalk.red(`✗ PID ${pid} 종료 실패`));
              resolve(false);
            }
          });
        }
      });
    });
  }

  // Sleeping 세션 종료
  async killSleepingSessions(sessions) {
    const sleepingSessions = sessions.filter(s => s.cpu < this.config.thresholds.sleepingCpu);

    if (sleepingSessions.length === 0) {
      console.log(chalk.yellow('종료할 Sleeping 세션이 없습니다.'));
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
      console.log(chalk.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // 오래된 세션 종료
  async killOldSessions(sessions) {
    const oldSessions = [];
    const now = Date.now();

    for (const session of sessions) {
      try {
        const result = execSync(`ps -p ${session.pid} -o lstart=`, { encoding: 'utf8' });
        const startTime = new Date(result.trim());
        const diff = now - startTime.getTime();
        const hours = diff / (1000 * 60 * 60);

        if (hours > this.config.thresholds.oldSessionHours) {
          oldSessions.push({ ...session, hours: Math.round(hours) });
        }
      } catch (e) {
        // 프로세스가 없거나 오류 발생
      }
    }

    if (oldSessions.length === 0) {
      console.log(chalk.yellow(`${this.config.thresholds.oldSessionHours}시간 이상 된 세션이 없습니다.`));
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
        console.log(chalk.dim(`${session.hours}시간 경과: ${session.project}`));
        if (await this.killSession(session.pid, session.project)) {
          killed++;
        }
      }
      console.log(chalk.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // 메인 메뉴
  async showMainMenu() {
    this.sessions = await this.getClaudeSessions();
    this.displaySessions(this.sessions);

    if (this.sessions.length === 0) {
      console.log(chalk.yellow('실행 중인 Claude 세션이 없습니다.'));
      return;
    }

    const choices = [
      { name: '특정 세션 종료', value: 'kill_specific' },
      { name: '모든 Sleeping 세션 종료', value: 'kill_sleeping' },
      { name: `메모리 ${this.config.thresholds.highMemoryMB}MB 이상 세션 종료`, value: 'kill_high_memory' },
      { name: `${this.config.thresholds.oldSessionHours}시간 이상 오래된 세션 종료`, value: 'kill_old' },
      new inquirer.Separator(),
      { name: '새로고침', value: 'refresh' },
      { name: '종료', value: 'quit' }
    ];

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: '선택:',
      choices
    }]);

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
      case 'refresh':
        await this.showMainMenu();
        return;
      case 'quit':
        console.log(chalk.green('프로그램을 종료합니다.'));
        process.exit(0);
    }

    // 작업 후 메뉴로 돌아가기
    const { cont } = await inquirer.prompt([{
      type: 'confirm',
      name: 'cont',
      message: '계속하시겠습니까?',
      default: true
    }]);

    if (cont) {
      await this.showMainMenu();
    }
  }

  // 특정 세션 종료
  async killSpecificSession() {
    const choices = this.sessions.map(s => ({
      name: `[${s.pid}] ${chalk.cyan(s.project)} - ${s.statusColor(s.status)} (${s.cpu}% CPU, ${s.memMB}MB)`,
      value: s
    }));

    const { session } = await inquirer.prompt([{
      type: 'list',
      name: 'session',
      message: '종료할 세션 선택:',
      choices: [...choices, new inquirer.Separator(), { name: '취소', value: null }]
    }]);

    if (session) {
      await this.killSession(session.pid, session.project);
    }
  }

  // 높은 메모리 세션 종료
  async killHighMemorySessions() {
    const highMemSessions = this.sessions.filter(s => s.memMB > this.config.thresholds.highMemoryMB);

    if (highMemSessions.length === 0) {
      console.log(chalk.yellow(`메모리 ${this.config.thresholds.highMemoryMB}MB 이상인 세션이 없습니다.`));
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
        console.log(chalk.dim(`${session.memMB}MB: ${session.project}`));
        if (await this.killSession(session.pid, session.project)) {
          killed++;
        }
      }
      console.log(chalk.green(`\n총 ${killed}개의 세션이 종료되었습니다.`));
    }
  }

  // 통계 표시
  async showStats() {
    this.sessions = await this.getClaudeSessions();

    console.clear();
    console.log(chalk.cyan.bold('\n📊 Claude Code 세션 통계\n'));

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
      ['총 세션 수', chalk.bold(stats.total)],
      ['Working', chalk.green(stats.working)],
      ['Idle', chalk.yellow(stats.idle)],
      ['Sleeping', chalk.gray(stats.sleeping)],
      ['총 메모리', chalk.bold(stats.totalMemory + 'MB')],
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

  switch (command) {
    case 'kill-sleeping':
    case 'ks':
      const sessions = await manager.getClaudeSessions();
      await manager.killSleepingSessions(sessions);
      break;

    case 'kill-old':
    case 'ko':
      const oldSessions = await manager.getClaudeSessions();
      await manager.killOldSessions(oldSessions);
      break;

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
  console.error(chalk.red('오류 발생:'), err.message);
  process.exit(1);
});

// 실행
if (require.main === module) {
  main().catch(err => {
    console.error(chalk.red('실행 오류:'), err);
    process.exit(1);
  });
}

module.exports = ClaudeSessionManager;