Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c cd /d C:\Users\user\Downloads\interview-agent\backend && .venv\Scripts\python.exe -m uvicorn main:app --host 0.0.0.0 --port 8000", 0, False
