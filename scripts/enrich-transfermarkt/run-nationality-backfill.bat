@echo off
call "%~dp0..\secrets.bat"
cd /d C:\Users\marcos\Desktop\primer-appcloud\scripts\enrich-transfermarkt
python backfill_nationality_api_football.py --limit 800 >> backfill_nationality_api_football_daily.log 2>&1
