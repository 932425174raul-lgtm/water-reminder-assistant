const { app, BrowserWindow, Menu, Tray, ipcMain, screen, nativeImage, globalShortcut, dialog } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const ExcelJS = require("exceljs");

const DEFAULT_SCHEDULE = {
  reminderOn: false,
  interval: 45,
  startTime: "08:00",
  endTime: "22:30",
  nextAt: null,
  water: 0,
  target: 2000,
  dayKey: null,
  widgetPosition: null,
  widgetMode: "expanded",
  theme: "light",
  lastLowProgressDate: null,
};

let mainWindow;
let reminderWindow;
let widgetWindow;
let edgeWindow;
let tray;
let reminderTimer;
let progressWatchTimer;
let widgetDragOrigin;
let isQuitting = false;
let schedule = { ...DEFAULT_SCHEDULE };

function settingsPath() {
  return path.join(app.getPath("userData"), "reminder-schedule.json");
}

function loadSchedule() {
  try {
    schedule = { ...DEFAULT_SCHEDULE, ...JSON.parse(fs.readFileSync(settingsPath(), "utf8")) };
  } catch {
    schedule = { ...DEFAULT_SCHEDULE };
  }
}

function saveSchedule() {
  fs.writeFileSync(settingsPath(), JSON.stringify(schedule), "utf8");
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isAwake(date = new Date()) {
  const now = date.getHours() * 60 + date.getMinutes();
  const start = timeToMinutes(schedule.startTime);
  const end = timeToMinutes(schedule.endTime);
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

function nextAwakeStart(date = new Date()) {
  const [hours, minutes] = schedule.startTime.split(":").map(Number);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  if (next <= date || isAwake(date)) next.setDate(next.getDate() + 1);
  return next;
}

function nextReminder(minutes = schedule.interval) {
  const proposed = new Date(Date.now() + minutes * 60 * 1000);
  return isAwake(proposed) ? proposed : nextAwakeStart(proposed);
}

function clearReminderTimer() {
  if (reminderTimer) clearTimeout(reminderTimer);
  reminderTimer = undefined;
}

function armReminder() {
  clearReminderTimer();
  if (!schedule.reminderOn || !schedule.nextAt) return;
  const due = new Date(schedule.nextAt);
  if (Number.isNaN(due.getTime())) return;
  const wait = due.getTime() - Date.now();
  if (wait <= 0) {
    if (!isAwake()) {
      schedule.nextAt = nextAwakeStart().toISOString();
      saveSchedule();
      armReminder();
      return;
    }
    showReminder();
    return;
  }
  reminderTimer = setTimeout(() => {
    if (isAwake()) showReminder();
    else {
      schedule.nextAt = nextAwakeStart().toISOString();
      saveSchedule();
      armReminder();
    }
  }, Math.min(wait, 2 ** 31 - 1));
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 760,
    minHeight: 620,
    show: false,
    backgroundColor: "#f7f8fa",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadFile("index.html");
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAPUlEQVQ4T2NkoBAwUqifYdQABYwMDAz/GRgY/if4z8DAwMDA8J+BgYHhP4MDA8N/BgYGhl8QAAByOQYReVPGGAAAAABJRU5ErkJggg==");
  tray = new Tray(icon);
  tray.setToolTip("喝水小助手");
  tray.on("click", showMainWindow);
  refreshTrayMenu();
}

function createWidget() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = 322;
  const height = 92;
  const position = schedule.widgetPosition || {
    x: workArea.x + workArea.width - width - 22,
    y: workArea.y + workArea.height - height - 22,
  };
  widgetWindow = new BrowserWindow({
    width,
    height,
    x: position.x,
    y: position.y,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWindow.loadFile("widget.html");
  widgetWindow.once("ready-to-show", applyWidgetMode);
  widgetWindow.on("moved", () => {
    const [x, y] = widgetWindow.getPosition();
    schedule.widgetPosition = { x, y };
    saveSchedule();
  });
  widgetWindow.on("closed", () => { widgetWindow = undefined; });
}

function createEdgeWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  edgeWindow = new BrowserWindow({
    width: 8,
    height: 88,
    x: workArea.x + workArea.width - 8,
    y: workArea.y + Math.round((workArea.height - 88) / 2),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  edgeWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  edgeWindow.loadFile("edge.html");
  edgeWindow.once("ready-to-show", applyWidgetMode);
  edgeWindow.on("closed", () => { edgeWindow = undefined; });
}

function widgetSize() {
  return schedule.widgetMode === "compact" ? { width: 116, height: 126 } : { width: 322, height: 92 };
}

function widgetPosition(size) {
  const { workArea } = screen.getPrimaryDisplay();
  const stored = schedule.widgetPosition || { x: workArea.x + workArea.width - size.width - 22, y: workArea.y + workArea.height - size.height - 22 };
  return {
    x: Math.max(workArea.x, Math.min(stored.x, workArea.x + workArea.width - size.width)),
    y: Math.max(workArea.y, Math.min(stored.y, workArea.y + workArea.height - size.height)),
  };
}

function placeEdge() {
  if (!edgeWindow || edgeWindow.isDestroyed()) return;
  const { workArea } = screen.getPrimaryDisplay();
  const size = edgeWindow.getSize();
  const position = widgetPosition(widgetSize());
  edgeWindow.setPosition(workArea.x + workArea.width - size[0], Math.max(workArea.y + 16, Math.min(position.y, workArea.y + workArea.height - size[1] - 16)));
}

function applyWidgetMode() {
  if (!widgetWindow || widgetWindow.isDestroyed() || !edgeWindow || edgeWindow.isDestroyed()) return;
  const mode = ["compact", "expanded", "hidden"].includes(schedule.widgetMode) ? schedule.widgetMode : "expanded";
  schedule.widgetMode = mode;
  if (mode === "hidden") {
    widgetWindow.hide();
    placeEdge();
    edgeWindow.showInactive();
  } else {
    edgeWindow.hide();
    const size = widgetSize();
    const position = widgetPosition(size);
    widgetWindow.setBounds({ x: position.x, y: position.y, width: size.width, height: size.height });
    widgetWindow.showInactive();
    widgetWindow.webContents.send("desktop:widget-mode-updated", mode);
  }
  saveSchedule();
  refreshTrayMenu();
}

function setWidgetMode(mode) {
  schedule.widgetMode = mode;
  applyWidgetMode();
}

function showWidgetMenu(window, point) {
  const activeMode = schedule.widgetMode;
  Menu.buildFromTemplate([
    { label: "精灵模式", type: "radio", checked: activeMode === "compact", click: () => setWidgetMode("compact") },
    { label: "完全显示", type: "radio", checked: activeMode === "expanded", click: () => setWidgetMode("expanded") },
    { label: "隐藏喝水胶囊", type: "radio", checked: activeMode === "hidden", click: () => setWidgetMode("hidden") },
    { type: "separator" },
    { label: "记录一杯水", click: () => notifyMain("desktop:quick-log") },
    { label: "打开喝水助手", click: showMainWindow },
    { type: "separator" },
    { label: "退出喝水助手", click: () => { isQuitting = true; app.quit(); } },
  ]).popup({ window, x: Math.round(point?.x || 0), y: Math.round(point?.y || 0) });
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开喝水小助手", click: showMainWindow },
    { label: "现在提醒", click: showReminder },
    { type: "separator" },
    { label: "精灵模式", type: "radio", checked: schedule.widgetMode === "compact", click: () => setWidgetMode("compact") },
    { label: "完全显示", type: "radio", checked: schedule.widgetMode === "expanded", click: () => setWidgetMode("expanded") },
    { label: "隐藏喝水胶囊", type: "radio", checked: schedule.widgetMode === "hidden", click: () => setWidgetMode("hidden") },
    { type: "separator" },
    { label: "退出", click: () => { isQuitting = true; app.quit(); } },
  ]));
}

function showMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function showReminder() {
  if (reminderWindow && !reminderWindow.isDestroyed()) {
    reminderWindow.showInactive();
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const width = 310;
  const height = 178;
  const [widgetX, widgetY] = widgetWindow && !widgetWindow.isDestroyed()
    ? widgetWindow.getPosition()
    : [workArea.x + workArea.width - width - 22, workArea.y + workArea.height - 112];
  reminderWindow = new BrowserWindow({
    width,
    height,
    x: Math.max(workArea.x + 12, Math.min(widgetX, workArea.x + workArea.width - width - 12)),
    y: Math.max(workArea.y + 12, widgetY - height - 10),
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: false,
    show: false,
    hasShadow: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false },
  });
  reminderWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  reminderWindow.loadFile("reminder.html");
  reminderWindow.once("ready-to-show", () => reminderWindow.showInactive());
  reminderWindow.on("closed", () => { reminderWindow = undefined; });
}

function closeReminder() {
  if (reminderWindow && !reminderWindow.isDestroyed()) reminderWindow.close();
}

function dayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function checkLowProgress() {
  const now = new Date();
  const ratio = schedule.dayKey === dayKey(now) ? Number(schedule.water || 0) / Number(schedule.target || 2000) : 0;
  const afternoon = now.getHours() >= 16 && now.getHours() < 19;
  if (schedule.reminderOn && afternoon && ratio < 0.25 && schedule.lastLowProgressDate !== dayKey(now)) {
    schedule.lastLowProgressDate = dayKey(now);
    saveSchedule();
    showReminder();
  }
}

function notifyMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function isoWeekKey(key) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + 4 - (date.getDay() || 7));
  const yearStart = new Date(date.getFullYear(), 0, 1);
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodRows(days, settings) {
  return Object.keys(days || {}).sort().map((key) => {
    const entries = days[key]?.entries || [];
    const water = entries.filter((entry) => entry.kind === "water").reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const target = Number(settings?.target || 2000);
    const date = new Date(`${key}T12:00:00`);
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1}`;
    return {
      key,
      water,
      target,
      completion: target ? water / target : 0,
      achieved: water >= target ? "达成" : "未达成",
      records: entries.filter((entry) => entry.kind === "water").length,
      week: isoWeekKey(key),
      month: key.slice(0, 7),
      quarter: `${date.getFullYear()}-${quarter}`,
      year: String(date.getFullYear()),
    };
  });
}

function makeSummary(rows, field) {
  const groups = new Map();
  rows.forEach((row) => {
    const group = groups.get(row[field]) || { period: row[field], days: 0, achieved: 0, water: 0, target: 0, records: 0 };
    group.days += 1;
    group.achieved += row.achieved === "达成" ? 1 : 0;
    group.water += row.water;
    group.target += row.target;
    group.records += row.records;
    groups.set(row[field], group);
  });
  return [...groups.values()].sort((a, b) => a.period.localeCompare(b.period));
}

function styleWorksheet(sheet) {
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1B2232" } };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  sheet.getRow(1).height = 24;
  sheet.eachRow((row, index) => {
    if (index > 1) row.alignment = { vertical: "middle" };
  });
  sheet.columns.forEach((column) => { column.width = 16; });
}

async function exportXlsx(payload) {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: "导出喝水记录",
    defaultPath: path.join(app.getPath("downloads"), `喝水记录-${dayKey()}.xlsx`),
    filters: [{ name: "Excel 工作簿", extensions: ["xlsx"] }],
  });
  if (canceled || !filePath) return { canceled: true };

  const rows = periodRows(payload.days, payload.settings);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "喝水小助手";
  workbook.created = new Date();
  const daily = workbook.addWorksheet("每日记录");
  daily.columns = [
    { header: "日期", key: "key" }, { header: "饮水量 (ml)", key: "water" }, { header: "目标 (ml)", key: "target" },
    { header: "完成率", key: "completion" }, { header: "状态", key: "achieved" }, { header: "记录次数", key: "records" },
    { header: "周", key: "week" }, { header: "月", key: "month" }, { header: "季度", key: "quarter" }, { header: "年", key: "year" },
  ];
  rows.forEach((row) => daily.addRow(row));
  daily.getColumn("completion").numFmt = "0.0%";
  styleWorksheet(daily);
  daily.autoFilter = "A1:J1";

  [["周汇总", "week"], ["月汇总", "month"], ["季度汇总", "quarter"], ["年度汇总", "year"]].forEach(([name, field]) => {
    const sheet = workbook.addWorksheet(name);
    sheet.columns = [
      { header: "周期", key: "period" }, { header: "记录天数", key: "days" }, { header: "达成天数", key: "achieved" },
      { header: "总饮水量 (ml)", key: "water" }, { header: "总目标 (ml)", key: "target" }, { header: "完成率", key: "completion" }, { header: "记录次数", key: "records" },
    ];
    makeSummary(rows, field).forEach((item) => sheet.addRow({ ...item, completion: item.target ? item.water / item.target : 0 }));
    sheet.getColumn("completion").numFmt = "0.0%";
    styleWorksheet(sheet);
    sheet.autoFilter = "A1:G1";
  });

  await workbook.xlsx.writeFile(filePath);
  return { canceled: false, filePath };
}

ipcMain.handle("desktop:get-schedule", () => schedule);
ipcMain.on("desktop:sync-schedule", (_event, incoming) => {
  schedule = { ...schedule, ...incoming };
  if (schedule.reminderOn && !schedule.nextAt) schedule.nextAt = nextReminder().toISOString();
  if (!schedule.reminderOn) schedule.nextAt = null;
  saveSchedule();
  armReminder();
  notifyMain("desktop:schedule-updated", schedule);
});
ipcMain.on("desktop:hide-to-tray", () => mainWindow?.hide());
ipcMain.on("desktop:show-main", showMainWindow);
ipcMain.on("desktop:quick-log", () => notifyMain("desktop:quick-log"));
ipcMain.on("desktop:show-widget-menu", (event, point) => showWidgetMenu(BrowserWindow.fromWebContents(event.sender), point));
ipcMain.on("desktop:reveal-widget", () => setWidgetMode("compact"));
ipcMain.on("desktop:set-widget-mode", (_event, mode) => {
  if (["compact", "expanded", "hidden"].includes(mode)) setWidgetMode(mode);
});
ipcMain.on("desktop:widget-drag-start", (_event, point) => {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const [x, y] = widgetWindow.getPosition();
  widgetDragOrigin = { pointerX: point.x, pointerY: point.y, windowX: x, windowY: y };
});
ipcMain.on("desktop:widget-drag-move", (_event, point) => {
  if (!widgetDragOrigin || !widgetWindow || widgetWindow.isDestroyed()) return;
  widgetWindow.setPosition(
    Math.round(widgetDragOrigin.windowX + point.x - widgetDragOrigin.pointerX),
    Math.round(widgetDragOrigin.windowY + point.y - widgetDragOrigin.pointerY),
  );
});
ipcMain.on("desktop:widget-drag-end", () => { widgetDragOrigin = undefined; });
ipcMain.handle("desktop:export-xlsx", (_event, payload) => exportXlsx(payload));
ipcMain.on("desktop:reminder-action", (_event, action) => {
  if (action === "snooze") schedule.nextAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  if (action === "skip") schedule.nextAt = nextReminder().toISOString();
  if (action === "log") schedule.nextAt = nextReminder().toISOString();
  saveSchedule();
  armReminder();
  closeReminder();
  notifyMain("desktop:reminder-action", action);
  notifyMain("desktop:schedule-updated", schedule);
});

app.whenReady().then(() => {
  loadSchedule();
  createMainWindow();
  createTray();
  createEdgeWindow();
  createWidget();
  armReminder();
  checkLowProgress();
  progressWatchTimer = setInterval(checkLowProgress, 60 * 1000);
  globalShortcut.register("CommandOrControl+Shift+W", () => notifyMain("desktop:quick-log"));
  app.on("activate", showMainWindow);
});
app.on("before-quit", () => { isQuitting = true; globalShortcut.unregisterAll(); clearInterval(progressWatchTimer); });
