@echo off
title AuditVT — Auto-sync Watcher
color 0A
echo.
echo  ============================================
echo   AuditVT Comparator — Auto-sync demarrage
echo  ============================================
echo.
cd /d "%~dp0"
python watch_and_sync.py
echo.
pause
