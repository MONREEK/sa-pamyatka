@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Первый запуск: ставлю компоненты, подожди минуту...
  call npm install --no-audit --no-fund
)
start "" /b npx electron .
