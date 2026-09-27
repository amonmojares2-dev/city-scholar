@echo off
cd /d "%~dp0"
node tmp-settings-check.js > "%~dp0check.log" 2>&1
