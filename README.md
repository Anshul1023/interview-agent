# 🎙 Interview AI Agent — Complete Guide

A real-time AI assistant that listens to interview questions (voice or typed),
and streams answers to a floating overlay window that is **completely hidden**
from screen recording, Zoom/Meet screen share, taskbar,and Alt+Tab.

---

## 📁 Project Structure

```
C:\Users\user\Downloads\
│
├── interview-agent\                        ← Main project folder
│   ├── backend\                            ← Python FastAPI backend
│   │   ├── data\
│   │   │   └── resumes.json               ← Stored resumes
│   │   ├── .venv\                          ← Python virtual environment
│   │   ├── .env                            ← API keys and config
│   │   ├── main.py                         ← Main FastAPI app + WebSocket endpoints
│   │   ├── llm_service.py                  ← LLM responses (Groq LLaMA)
│   │   ├── stt_service.py                  ← Speech-to-Text (Groq Whisper)
│   │   ├── screen_service.py               ← Screenshot OCR
│   │   ├── resume_db.py                    ← Resume storage
│   │   ├── overlay.html                    ← Floating overlay UI
│   │   └── requirements.txt               ← Python dependencies
│   │
│   ├── electron\                           ← Electron files (not used in final setup)
│   │   ├── main.js
│   │   └── preload.js
│   │
│   ├── frontend\                           ← React frontend (not used in final setup)
│   │   └── src\
│   │       ├── App.jsx
│   │       ├── index.html
│   │       ├── main.jsx
│   │       ├── overlay.jsx
│   │       └── vite.config.js
│   │
│   ├── node_modules\
│   ├── .env.example
│   ├── package.json
│   └── README.md
│
└── ai-overlay\                             ← Electron wrapper (hides from screen share)
    ├── main.js                             ← Electron main process
    ├── package.json                        ← Node dependencies
    ├── start.vbs                           ← Silent launcher script
    └── node_modules\
```

> ✅ **Only two folders matter for daily use:**
> - `interview-agent\backend\` — the Python backend
> - `ai-overlay\` — the Electron overlay window

---

## 🛠️ Technologies Used

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Backend | Python + FastAPI | WebSocket server, REST API |
| STT | Groq Whisper (whisper-large-v3-turbo) | Speech to text |
| LLM | Groq LLaMA (llama-3.3-70b-versatile) | AI answers |
| Overlay UI | HTML + CSS + JavaScript | Floating overlay interface |
| Desktop App | Electron | Hides overlay from screen capture |
| Background Service | Windows Task Scheduler | Runs backend silently |

---

## ⚙️ Environment Variables (.env file)

Located at:
```
C:\Users\user\Downloads\interview-agent\backend\.env
```

Contents:
```
GROQ_API_KEY=your_groq_key_here
GROQ_MODEL=llama-3.3-70b-versatile
AUDIO_SAMPLE_RATE=16000
RESUME_STORE_PATH=data/resumes.json
```

Get free Groq API key at: https://console.groq.com/keys

---

## 🚀 First Time Setup (Already Done)

These steps were completed during initial setup. Listed here for reference only.

### 1. Python Virtual Environment
```powershell
cd C:\Users\user\Downloads\interview-agent\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
pip install groq
```

### 2. Electron Setup
```powershell
cd C:\Users\user\Downloads\ai-overlay
npm install
```

### 3. Backend as Windows Service (Task Scheduler)
Run PowerShell **as Administrator**:
```powershell
$action = New-ScheduledTaskAction -Execute "C:\Users\user\Downloads\interview-agent\backend\.venv\Scripts\python.exe" -Argument "-m uvicorn main:app --host 0.0.0.0 --port 8000" -WorkingDirectory "C:\Users\user\Downloads\interview-agent\backend"
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName "AIInterviewBackend" -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force
```

---

## 📋 How to Use (Daily Workflow)

### Step 1 — Start the backend
Double-click **Start AI Backend** shortcut on desktop.

Or run in PowerShell:
```powershell
Start-ScheduledTask -TaskName "AIInterviewBackend"
```

Verify it is running:
```powershell
Invoke-RestMethod http://localhost:8000/health
```
Should return: `status: ok`

### Step 2 — Open the overlay
Double-click **AI Interview** shortcut on desktop.

Or run manually:
```powershell
cd C:\Users\user\Downloads\ai-overlay
npx electron .
```

### Step 3 — Use the overlay
1. Click **🎤 Start** button
2. Speak your question naturally
3. Wait ~1.5 seconds of silence
4. AI answer streams automatically
5. Mic resumes listening for next question
6. Repeat — works like a continuous conversation

Or type any question in the bottom text box and press Enter.

### Step 4 — Stop when done
Double-click **Stop AI Backend** shortcut on desktop.

Or run in PowerShell:
```powershell
Stop-ScheduledTask -TaskName "AIInterviewBackend"
```

---

## 🎤 Voice Input Guide

- Click **Start** once — listens **continuously forever**
- Speak naturally at normal speed
- **Orange countdown bar** appears when you stop speaking
- After **1.5 seconds of silence** → auto-sends to AI
- Answer streams in the overlay
- Mic auto-resumes after answer is done
- Click **Stop** only when you want to completely stop

### Tips for best results:
- 🎧 Use headphones — prevents mic picking up AI answer from speakers
- 🗣️ Speak clearly for at least 2-3 seconds
- 🔇 Mic auto-mutes while AI is responding
- ⌨️ Use text box for coding/DSA questions (more accurate than voice)

---

## ⌨️ Text Input Guide

Type any question in the bottom box and press **Enter** or click **Ask →**

Works great for:
- Coding: `Write a binary search in Python`
- DSA: `Explain merge sort time complexity`
- System design: `Design a URL shortener`
- HR: `What are your strengths`
- Any technical topic

---

## 🪟 Overlay Controls

| Control | Description |
|---------|-------------|
| **🎤 Start button** | Start continuous listening |
| **⏹ Stop button** | Stop listening |
| **Opacity slider** | Adjust transparency (15% to 100%) |
| **W slider** | Adjust width of overlay |
| **H slider** | Adjust height of overlay |
| **🗑 button** | Clear current response |

---

## 🙈 How It Is Hidden From Everyone

### Hidden from screen recording (OBS, Windows Record):
`win.setContentProtection(true)` in Electron uses Windows API
`SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` — the window
is excluded from ALL screen capture at OS level.

### Hidden from Zoom/Meet screen share:
Same `setContentProtection(true)` — Zoom cannot capture it.
The overlay appears on YOUR physical monitor but shows as
a black/empty area in any screen capture tool.

### Hidden from taskbar:
`skipTaskbar: true` and `win.setSkipTaskbar(true)` in Electron.

### Hidden from Alt+Tab:
`hookWindowMessage` intercepts focus messages so window
never appears in the Alt+Tab switcher.

### Backend hidden:
Runs as Windows Task Scheduler task — no terminal window,
no process visible in taskbar, starts automatically on login.

---

## 🖥️ Creating Desktop Shortcuts

### AI Interview Overlay shortcut:
```powershell
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\AI Interview.lnk")
$Shortcut.TargetPath = "wscript.exe"
$Shortcut.Arguments = "C:\Users\user\Downloads\ai-overlay\start.vbs"
$Shortcut.IconLocation = "shell32.dll,13"
$Shortcut.Save()
```

### Start Backend shortcut:
```powershell
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Start AI Backend.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-WindowStyle Hidden -Command Start-ScheduledTask -TaskName AIInterviewBackend"
$Shortcut.IconLocation = "shell32.dll,13"
$Shortcut.Save()
```

### Stop Backend shortcut:
```powershell
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut("$env:USERPROFILE\Desktop\Stop AI Backend.lnk")
$Shortcut.TargetPath = "powershell.exe"
$Shortcut.Arguments = "-WindowStyle Hidden -Command Stop-ScheduledTask -TaskName AIInterviewBackend"
$Shortcut.IconLocation = "shell32.dll,131"
$Shortcut.Save()
```

---

## 🔧 Managing the Backend Service

| Action | Command |
|--------|---------|
| Start backend | `Start-ScheduledTask -TaskName "AIInterviewBackend"` |
| Stop backend | `Stop-ScheduledTask -TaskName "AIInterviewBackend"` |
| Check status | `Get-ScheduledTask -TaskName "AIInterviewBackend" \| Select-Object State` |
| Restart | `Stop-ScheduledTask -TaskName "AIInterviewBackend"; Start-ScheduledTask -TaskName "AIInterviewBackend"` |
| Test backend | `Invoke-RestMethod http://localhost:8000/health` |

### Status meanings:
- **Running** = ✅ Active and working
- **Ready** = ⛔ Stopped, not running
- **Disabled** = ⛔ Disabled, needs to be enabled

---

## 🔄 Updating API Keys

Open the .env file:
```powershell
notepad C:\Users\user\Downloads\interview-agent\backend\.env
```

Replace the key and save. Then restart the backend:
```powershell
Stop-ScheduledTask -TaskName "AIInterviewBackend"
Start-ScheduledTask -TaskName "AIInterviewBackend"
```

---

## 🐛 Troubleshooting

### Overlay shows "Backend not running"
```powershell
Start-ScheduledTask -TaskName "AIInterviewBackend"
Invoke-RestMethod http://localhost:8000/health
```

### "WS failed" error in overlay
Backend stopped. Start it again:
```powershell
Start-ScheduledTask -TaskName "AIInterviewBackend"
```

### Overlay not opening
```powershell
cd C:\Users\user\Downloads\ai-overlay
npx electron .
```

### Backend won't start (port in use)
```powershell
netstat -ano | findstr :8000
taskkill /PID <pid_number> /F
Start-ScheduledTask -TaskName "AIInterviewBackend"
```

### Rate limit error from Groq
Wait a few minutes (free tier has daily token limits) or
get a new API key at https://console.groq.com/keys

### Voice not being detected
- Check mic is set as default in Windows Sound Settings
- Speak louder and closer to mic
- Use headphones to prevent echo
- Check volume bar in overlay is moving when you speak

---

## 📡 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Check if backend is running |
| `/overlay` | GET | Serve the overlay HTML |
| `/resume` | POST | Upload candidate resume |
| `/resume/{name}` | GET | Get stored resume |
| `/ask` | POST | Stream answer for typed question |
| `/ws/audio` | WebSocket | Real-time audio transcription + LLM |
| `/ws/screen` | WebSocket | Screenshot OCR + LLM |

---

## 🔐 Security Notes

- Never share your `.env` file — it contains your API keys
- Never paste your API keys in chat or publicly
- If key is exposed, go to https://console.groq.com/keys and delete it immediately
- The overlay window content is protected from screen capture at OS level
- Backend only runs on localhost — not accessible from internet

---

## 📞 Quick Reference Card

```
BEFORE INTERVIEW:
1. Double-click "Start AI Backend" on desktop
2. Double-click "AI Interview" on desktop
3. Click Start in overlay

DURING INTERVIEW:
- Speak naturally → answer appears automatically
- Type in bottom box for coding/DSA questions
- Drag overlay anywhere on screen
- Adjust opacity/size with sliders

AFTER INTERVIEW:
- Double-click "Stop AI Backend" on desktop
- Close Electron overlay window
```