#!/bin/bash

# Claude Session Manager Plugin 설치 스크립트

echo "Claude Session Manager Plugin 설치를 시작합니다..."

# 의존성 설치
echo "의존성 설치 중..."
npm install

# 실행 권한 부여
chmod +x src/index.js

# Claude 플러그인 디렉토리 확인
CLAUDE_PLUGIN_DIR="$HOME/.claude/plugins"

if [ ! -d "$CLAUDE_PLUGIN_DIR" ]; then
    echo "Claude 플러그인 디렉토리를 생성합니다..."
    mkdir -p "$CLAUDE_PLUGIN_DIR"
fi

# 플러그인 심볼릭 링크 생성
PLUGIN_NAME="claude-session-manager"
PLUGIN_PATH="$CLAUDE_PLUGIN_DIR/$PLUGIN_NAME"

if [ -e "$PLUGIN_PATH" ]; then
    echo "기존 플러그인을 제거합니다..."
    rm -rf "$PLUGIN_PATH"
fi

echo "플러그인을 설치합니다..."
ln -s "$(pwd)" "$PLUGIN_PATH"

echo ""
echo "✅ 설치가 완료되었습니다!"
echo ""
echo "사용법:"
echo "  Claude Code에서 다음 명령어를 사용하세요:"
echo "  /session-manager  - 세션 관리자 실행"
echo "  /kill-sleeping    - Sleeping 세션 종료"
echo "  /kill-old         - 오래된 세션 종료"
echo "  /session-stats    - 세션 통계 보기"
echo ""
echo "플러그인이 표시되지 않으면 Claude Code를 재시작하세요."