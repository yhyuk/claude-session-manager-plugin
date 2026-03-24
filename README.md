# Claude Session Manager Plugin

백그라운드에서 실행 중인 Claude Code 세션을 쉽게 관리할 수 있는 플러그인입니다.

## 주요 기능

- 실행 중인 모든 Claude Code 세션 표시
- 프로젝트별 세션 구분 및 상태 표시
- 선택적 세션 종료
- Sleeping 세션 자동 정리
- 오래된 세션 자동 정리
- 메모리 사용량 모니터링

## 설치 방법

### 방법 1: 로컬 설치
```bash
# 플러그인 디렉토리로 이동
cd ~/claude-session-manager-plugin

# 의존성 설치
npm install

# Claude Code 플러그인으로 설치
claude plugin install .
```

### 방법 2: Git 저장소에서 설치
```bash
# GitHub에 업로드 후
claude plugin install https://github.com/yourusername/claude-session-manager
```

## 사용법

### 플러그인 실행
```bash
# 메인 세션 관리자 실행
/session-manager
# 또는 단축 명령
/csm
```

### 빠른 명령어

#### Sleeping 세션 모두 종료
```bash
/kill-sleeping
# 또는
/ks
```

#### 24시간 이상 오래된 세션 종료
```bash
/kill-old
# 또는
/ko
```

#### 세션 통계 보기
```bash
/session-stats
# 또는
/stats
```

## 화면 구성

```
╔════════════════════════════════════════════════════════════════════════╗
║    Claude Code Session Manager v1.0                                   ║
╚════════════════════════════════════════════════════════════════════════╝

┌─────┬───────┬──────────┬──────┬───────┬─────────┬──────────┐
│ No. │ PID   │ Project  │ CPU% │ MEM   │ Start   │ Status   │
├─────┼───────┼──────────┼──────┼───────┼─────────┼──────────┤
│ [1] │ 59294 │ ~        │ 11%  │ 388MB │ 5:15AM  │ Working  │
│ [2] │ 95274 │ medicrm  │ 0.3% │ 89MB  │ 11:23#  │ Sleeping │
│ [3] │ 81019 │ archery  │ 0%   │ 153MB │ 10:27#  │ Sleeping │
└─────┴───────┴──────────┴──────┴───────┴─────────┴──────────┘

총 3개의 세션 | 메모리 사용: 630MB
```

### 상태 구분
- **Working**: CPU 사용률 > 5% (활발히 작업 중)
- **Idle**: CPU 사용률 1-5% (대기 상태)
- **Sleeping**: CPU 사용률 < 1% (휴면 상태)

## 설정

플러그인 설정은 `~/.claude/plugins/claude-session-manager/config.json`에서 변경할 수 있습니다:

```json
{
  "autoCleanup": false,
  "cleanupInterval": 3600000,
  "memoryThreshold": 100,
  "oldSessionHours": 24
}
```

## 안전 기능

- 모든 종료 작업 전 확인 프롬프트
- SIGTERM 우선 사용 (안전한 종료)
- 실패 시에만 SIGKILL 사용

## 문제 해결

### 권한 오류
```bash
sudo claude /session-manager
```

### 플러그인이 표시되지 않을 때
```bash
claude plugin list
claude plugin reload
```

## 라이선스

MIT License

## 기여

Issues와 Pull Requests를 환영합니다!

## 지원

문제가 있으시면 Issues를 열어주세요.