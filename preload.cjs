const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  getSchedule: () => ipcRenderer.invoke("desktop:get-schedule"),
  syncSchedule: (schedule) => ipcRenderer.send("desktop:sync-schedule", schedule),
  hideToTray: () => ipcRenderer.send("desktop:hide-to-tray"),
  showMain: () => ipcRenderer.send("desktop:show-main"),
  reminderAction: (action) => ipcRenderer.send("desktop:reminder-action", action),
  quickLog: () => ipcRenderer.send("desktop:quick-log"),
  startWidgetDrag: (point) => ipcRenderer.send("desktop:widget-drag-start", point),
  moveWidgetDrag: (point) => ipcRenderer.send("desktop:widget-drag-move", point),
  endWidgetDrag: () => ipcRenderer.send("desktop:widget-drag-end"),
  exportXlsx: (payload) => ipcRenderer.invoke("desktop:export-xlsx", payload),
  showWidgetMenu: (point) => ipcRenderer.send("desktop:show-widget-menu", point),
  revealWidget: () => ipcRenderer.send("desktop:reveal-widget"),
  setWidgetMode: (mode) => ipcRenderer.send("desktop:set-widget-mode", mode),
  onScheduleUpdated: (callback) => ipcRenderer.on("desktop:schedule-updated", (_event, schedule) => callback(schedule)),
  onReminderAction: (callback) => ipcRenderer.on("desktop:reminder-action", (_event, action) => callback(action)),
  onQuickLog: (callback) => ipcRenderer.on("desktop:quick-log", callback),
  onWidgetModeUpdated: (callback) => ipcRenderer.on("desktop:widget-mode-updated", (_event, mode) => callback(mode)),
});
