const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  toggleOverlay: () => ipcRenderer.send("toggle-overlay"),
  sendAiToken: (text) => ipcRenderer.send("ai-token", text),
  sendAiDone: () => ipcRenderer.send("ai-done"),
  sendTranscript: (text) => ipcRenderer.send("transcript", text),
  onAiToken: (cb) => ipcRenderer.on("ai-token", (_, t) => cb(t)),
  onAiDone: (cb) => ipcRenderer.on("ai-done", () => cb()),
  onTranscript: (cb) => ipcRenderer.on("transcript", (_, t) => cb(t)),
});