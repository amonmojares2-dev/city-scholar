@echo off
cd /d "%~dp0client"
call npx tsc --noEmit > "%~dp0tsc.log" 2>&1
if errorlevel 1 (echo TSC_FAIL> "%~dp0tsc.done") else (echo TSC_OK> "%~dp0tsc.done")
