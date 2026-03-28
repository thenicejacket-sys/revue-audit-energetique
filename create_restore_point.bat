@echo off
title AuditVT — Restore Point Manuel
color 0E
echo.
echo  ============================================
echo   Creation d'un restore point manuel
echo  ============================================
echo.
cd /d "%~dp0"

set /p LABEL="Nom du restore point (ex: avant-refonte-excel) : "
if "%LABEL%"=="" set LABEL=manuel

for /f "tokens=1-5 delims=/ " %%a in ('date /t') do set DATE=%%c-%%b-%%a
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set TIME=%%a-%%b

set TAGNAME=restore/%DATE%_%TIME%_%LABEL%
echo.
echo  Tag : %TAGNAME%
echo.

git add AuditVT_Comparator.html
git commit -m "Restore point manuel : %LABEL% — %DATE% %TIME%" --allow-empty
git tag -a "%TAGNAME%" -m "Restore point manuel : %LABEL%"
git push
git push origin "%TAGNAME%"

echo.
echo  Restore point cree avec succes !
echo  Tag : %TAGNAME%
echo.
pause
