@echo off
rem Abre Chrome (perfil del sync) en Sofascore para resolver su captcha una vez.
call "%~dp0..\secrets.bat"
cd /d "%~dp0"
python sync.py --desbloquear
pause
