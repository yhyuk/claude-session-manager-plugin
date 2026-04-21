#!/bin/bash

# Claude Session Manager Plugin 설치 스크립트

echo "Claude Session Manager Plugin 설치를 시작합니다..."

# 의존성 설치
echo "의존성 설치 중..."
npm install

# 실행 권한 부여
chmod +x src/index.js

# 전역 CLI 명령어 설치 (ccm)
echo "전역 CLI 명령어(ccm) 설치 중..."
CCM_LINK=""

# npm의 전역 bin 디렉토리에 심볼릭 링크 생성 시도
NPM_BIN=$(npm prefix -g 2>/dev/null)/bin

if [ -d "$NPM_BIN" ] && [ -w "$NPM_BIN" ]; then
    ln -sf "$(pwd)/src/index.js" "$NPM_BIN/ccm"
    CCM_LINK="$NPM_BIN/ccm"
elif [ -w "/usr/local/bin" ]; then
    ln -sf "$(pwd)/src/index.js" "/usr/local/bin/ccm"
    CCM_LINK="/usr/local/bin/ccm"
else
    # sudo 필요한 경우
    echo "전역 설치를 위해 sudo 권한이 필요합니다..."
    sudo ln -sf "$(pwd)/src/index.js" "/usr/local/bin/ccm"
    CCM_LINK="/usr/local/bin/ccm"
fi

if [ $? -eq 0 ] && [ -n "$CCM_LINK" ]; then
    echo "ccm 명령어가 설치되었습니다: $CCM_LINK"
else
    echo "전역 설치 실패. 수동으로 실행하려면: node $(pwd)/src/index.js"
fi

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

echo "Claude 플러그인을 설치합니다..."
ln -s "$(pwd)" "$PLUGIN_PATH"

echo ""
echo "설치가 완료되었습니다!"
echo ""
echo "사용법:"
echo "  [터미널 어디서든]"
echo "  ccm                - 세션 관리자 실행"
echo "  ccm ks             - Sleeping 세션 종료"
echo "  ccm ko             - 오래된 세션 종료"
echo "  ccm stats          - 세션 통계 보기"
echo ""
echo "  [Claude Code 내에서]"
echo "  /session-manager   - 세션 관리자 실행"
echo "  /kill-sleeping     - Sleeping 세션 종료"
echo "  /kill-old          - 오래된 세션 종료"
echo "  /session-stats     - 세션 통계 보기"
echo ""
echo "플러그인이 표시되지 않으면 Claude Code를 재시작하세요."