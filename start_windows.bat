@echo off
cd /d "%~dp0"
title FoodWise Pro v15 Local
start "FoodWise" "http://localhost:3000"
node server.js
pause
