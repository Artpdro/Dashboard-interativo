@echo off
chcp 65001 >nul
title CRM Enterprise - nao feche esta janela
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale em https://nodejs.org
  pause
  exit /b 1
)
node scripts\launcher.js
if errorlevel 1 pause
