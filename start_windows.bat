@echo off
cd /d "%~dp0"
title FoodWise Pro Dark v3
start "FoodWise" "http://localhost:3000"
node server.js
pause
