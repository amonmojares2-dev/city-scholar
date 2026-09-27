@echo off
cd /d "%~dp0server"
call npx jest > "%~dp0test.log" 2>&1
if errorlevel 1 (echo TEST_FAIL> "%~dp0test.done") else (echo TEST_OK> "%~dp0test.done")
