@echo off
chcp 65001 > nul
echo ============================================================
echo   동래·연제 전세 4분할 레이더 (JeonseRadar 4X) - GitHub 배포
echo ============================================================
echo.

git status > nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [1/3] Git 저장소 초기화 중...
    git init -b main
)

echo [2/3] 파일 커밋 중...
git add .
git commit -m "feat: 동래·연제 전세 4분할 레이더 웹 앱 구축"

echo.
echo [3/3] GitHub 저장소에 푸시하려면 다음 중 하나를 선택하세요:
echo.
echo 1) GitHub CLI로 새 공개 저장소 자동 생성 및 푸시 (gh auth login 필요)
echo 2) 기존에 생성해둔 GitHub 저장소 URL 직접 연결
echo 3) 종료
echo.

set /p choice="선택 (1/2/3): "

if "%choice%"=="1" (
    echo.
    echo GitHub에 저장소를 생성하고 푸시합니다...
    gh repo create jeonse-radar-4x --public --source=. --remote=origin --push
    echo.
    echo 배포 준비 완료! GitHub 저장소 Settings - Pages 에서 배포를 활성화하세요.
    pause
    exit /b
)

if "%choice%"=="2" (
    set /p repo_url="GitHub 저장소 URL 입력 (예: https://github.com/사용자명/저장소명.git): "
    git remote remove origin > nul 2>&1
    git remote add origin %repo_url%
    git branch -M main
    git push -u origin main
    echo.
    echo 푸시 완료!
    pause
    exit /b
)

echo 배포를 종료합니다.
pause
