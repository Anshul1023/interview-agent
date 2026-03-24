process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = "true";

const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require("electron");
const path = require("path");

app.disableHardwareAcceleration();
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("disable-gpu-compositing");
app.commandLine.appendSwitch("disable-gpu-rasterization");
app.commandLine.appendSwitch("disable-gpu-sandbox");
app.commandLine.appendSwitch("no-sandbox");

const isDev = true;
const FRONTEND_URL = "http://localhost:5173";

let mainWindow;
let overlayWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 820,
    height: 780,
    title: "Interview AI Agent",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  mainWindow.loadURL(FRONTEND_URL);
  mainWindow.on("closed", () => { mainWindow = null; overlayWindow?.close(); });
}

function createOverlayWindow() {
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow = new BrowserWindow({
    width: 400,
    height: 280,
    x: sw - 420,
    y: sh - 320,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    backgroundColor: "#0f172a",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  overlayWindow.loadURL("http://localhost:5173/overlay");
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.on("closed", () => { overlayWindow = null; });
}

ipcMain.on("ai-token", (event, text) => {
  overlayWindow?.webContents.send("ai-token", text);
});

ipcMain.on("ai-done", () => {
  overlayWindow?.webContents.send("ai-done");
});

ipcMain.on("transcript", (event, text) => {
  overlayWindow?.webContents.send("transcript", text);
});

ipcMain.on("toggle-overlay", () => {
  if (overlayWindow) {
    overlayWindow.isVisible() ? overlayWindow.hide() : overlayWindow.show();
  } else {
    createOverlayWindow();
  }
});

app.whenReady().then(() => {
  createMainWindow();
  createOverlayWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});