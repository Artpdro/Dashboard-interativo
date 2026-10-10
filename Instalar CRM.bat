@echo off
chcp 65001 >nul
title Instalador - CRM Enterprise
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Instale a versao LTS em https://nodejs.org e execute este arquivo de novo.
  start https://nodejs.org
  pause
  exit /b 1
)
node scripts\setup.js
if errorlevel 1 echo. & echo A instalacao nao terminou. Leia a mensagem acima.
pause
