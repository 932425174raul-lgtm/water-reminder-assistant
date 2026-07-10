const STORAGE_KEY = "waterAssistant.v2";
const MAIN_ARC = 414.69;

const drinkNotes = [
  { id: "healthy", name: "无糖茶", examples: "东方树叶、淡茶", tone: "healthy" },
  { id: "soda", name: "碳酸饮料", examples: "可乐、雪碧", tone: "soda" },
  { id: "juice", name: "果汁", examples: "橙汁、西瓜汁", tone: "juice" },
  { id: "milkTea", name: "奶茶/果茶", examples: "奶茶店饮品", tone: "milkTea" },
];

const defaultSettings = { target: 2000, cupSize: 500, interval: 45, startTime: "08:00", endTime: "22:30", reminderOn: false, theme: "light" };
const els = {};
let state = loadState();
let toastTimer = 0;
let summaryPeriod = "week";
const isDesktop = Boolean(window.desktop);

function todayKey(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function loadState() {
  const fallback = { settings: { ...defaultSettings }, days: {}, reminder: { nextAt: null, snoozes: 0, pausedDate: null } };
  try {
    let parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!parsed) {
      const legacy = JSON.parse(localStorage.getItem("waterAssistant.v1"));
      if (legacy) {
        parsed = {
          settings: {
            target: legacy.settings?.target,
            interval: legacy.settings?.interval,
            startTime: legacy.settings?.startTime,
            endTime: legacy.settings?.endTime,
            reminderOn: legacy.settings?.reminderOn,
          },
          days: Object.fromEntries(Object.entries(legacy.days || {}).map(([key, day]) => [key, {
            entries: (day.entries || []).filter((entry) => entry.drinkId === "water").map((entry) => ({
              id: entry.id,
              kind: "water",
              amount: entry.amount,
              at: entry.at,
            })),
          }])),
          reminder: legacy.reminder,
        };
      }
    }
    if (!parsed) return fallback;
    return { ...fallback, ...parsed, settings: { ...defaultSettings, ...(parsed.settings || {}) }, days: parsed.days || {}, reminder: { ...fallback.reminder, ...(parsed.reminder || {}) } };
  } catch { return fallback; }
}

function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function syncDesktopSchedule() {
  if (!isDesktop) return;
  const totals = calculate();
  window.desktop.syncSchedule({
    reminderOn: state.settings.reminderOn,
    interval: state.settings.interval,
    startTime: state.settings.startTime,
    endTime: state.settings.endTime,
    nextAt: state.reminder.nextAt,
    water: totals.water,
    target: state.settings.target,
    dayKey: todayKey(),
    theme: state.settings.theme,
  });
}
function ensureDay(key = todayKey()) { if (!state.days[key]) state.days[key] = { entries: [] }; return state.days[key]; }
function cupTarget(settings = state.settings) { return Math.ceil(settings.target / settings.cupSize); }
function calculate(day = ensureDay(), settings = state.settings) {
  const water = day.entries.filter((entry) => entry.kind === "water").reduce((sum, entry) => sum + entry.amount, 0);
  const cups = water / settings.cupSize;
  return { water, cups, cupTarget: cupTarget(settings), remaining: Math.max(0, settings.target - water), remainingCups: Math.max(0, Math.ceil((settings.target - water) / settings.cupSize)), progress: Math.min(1, water / settings.target), completed: water >= settings.target };
}

function addWater(amount) {
  const safeAmount = Math.min(2000, Math.max(50, Math.round(amount)));
  ensureDay().entries.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind: "water", amount: safeAmount, at: new Date().toISOString() });
  scheduleNextReminder(); saveState(); render(); closeReminder(); showToast(`已完成 ${safeAmount}ml，这一杯记住了。`);
  syncDesktopSchedule();
}

function addDrinkNote(id) {
  const drink = drinkNotes.find((item) => item.id === id);
  ensureDay().entries.unshift({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, kind: "note", noteId: id, at: new Date().toISOString() });
  saveState(); render(); showToast(`${drink.name}已记为备注，不计入喝水杯数。`);
}

function removeEntry(id) { ensureDay().entries = ensureDay().entries.filter((entry) => entry.id !== id); saveState(); render(); syncDesktopSchedule(); }
function resetToday() { ensureDay().entries = []; state.reminder.snoozes = 0; saveState(); render(); syncDesktopSchedule(); showToast("今日记录已清空"); }
function parseMinutes(value) { const [hours, minutes] = value.split(":").map(Number); return hours * 60 + minutes; }
function isAwake(date = new Date()) { const current = date.getHours() * 60 + date.getMinutes(); const start = parseMinutes(state.settings.startTime); const end = parseMinutes(state.settings.endTime); return start <= end ? current >= start && current <= end : current >= start || current <= end; }
function nextAwakeStart(date = new Date()) { const [hours, minutes] = state.settings.startTime.split(":").map(Number); const next = new Date(date); next.setHours(hours, minutes, 0, 0); if (next <= date || isAwake(date)) next.setDate(next.getDate() + 1); return next; }
function scheduleNextReminder(minutes = state.settings.interval) { if (!state.settings.reminderOn) return; const next = new Date(Date.now() + minutes * 60000); state.reminder.nextAt = (isAwake(next) ? next : nextAwakeStart(next)).toISOString(); }
function toggleReminder() { state.settings.reminderOn = !state.settings.reminderOn; state.reminder.pausedDate = null; if (state.settings.reminderOn) { scheduleNextReminder(); showToast("今日守护已开启"); } else { state.reminder.nextAt = null; showToast("今日守护已暂停"); } saveState(); render(); syncDesktopSchedule(); }

function dueReminder() {
  if (isDesktop) return;
  if (!state.settings.reminderOn || state.reminder.pausedDate === todayKey() || !state.reminder.nextAt) return;
  if (Date.now() < new Date(state.reminder.nextAt).getTime()) return;
  if (!isAwake()) { state.reminder.nextAt = nextAwakeStart().toISOString(); saveState(); render(); return; }
  openReminder();
}
function openReminder() { if (isDesktop) return; showToast("桌面版会在屏幕右下角安静提醒"); }
function closeReminder() {}
function snooze(minutes = 5) { state.reminder.snoozes += 1; state.reminder.nextAt = new Date(Date.now() + minutes * 60000).toISOString(); saveState(); render(); syncDesktopSchedule(); showToast(`已延后 ${minutes} 分钟`); }
function skipReminder() { scheduleNextReminder(); saveState(); render(); syncDesktopSchedule(); showToast("已跳过本次提醒"); }
function showToast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.add("is-visible"); toastTimer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200); }
function formatTime(dateLike) { return dateLike ? new Date(dateLike).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }) : "未开启"; }
function formatCountdown() { if (!state.settings.reminderOn || !state.reminder.nextAt) return "--:--"; const diff = new Date(state.reminder.nextAt).getTime() - Date.now(); if (diff <= 0) return "到点"; const seconds = Math.ceil(diff / 1000); return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`; }

function renderCupDots(container, totals, detailed) {
  const target = totals.cupTarget;
  const completed = Math.floor(totals.cups);
  container.innerHTML = Array.from({ length: target }, (_, index) => `<span class="cup-dot ${index < completed ? "is-done" : ""} ${index === completed && !totals.completed ? "is-next" : ""}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h10l-1 15H8L7 5Z" /><path d="M6 5h12" /></svg>${detailed ? `<b>第 ${index + 1} 杯</b>` : ""}</span>`).join("");
}
function renderDrinks() { els.drinkGrid.innerHTML = drinkNotes.map((drink) => `<button class="drink-card" data-drink-id="${drink.id}" data-tone="${drink.tone}" type="button"><b>${drink.name}</b><span>${drink.examples}</span></button>`).join(""); }
function renderStatus() {
  const totals = calculate();
  els.todayLabel.textContent = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  els.mainGap.textContent = totals.completed ? "今天的水，喝够了" : totals.water ? `再喝 ${totals.remainingCups} 杯左右` : "喝第一杯水";
  els.targetCupText.textContent = totals.cupTarget;
  els.goalCopy.textContent = `目标 ${state.settings.target}ml，按 ${state.settings.cupSize}ml 一杯，今天喝 ${totals.cupTarget} 杯就好。`;
  els.waterValue.textContent = totals.water;
  els.progressCaption.textContent = `${Math.min(totals.cups, totals.cupTarget).toFixed(totals.cups % 1 ? 1 : 0)} / ${totals.cupTarget} 杯`;
  els.cupAmountLabel.textContent = `${state.settings.cupSize}ml`;
  els.progressArc.style.strokeDashoffset = MAIN_ARC - MAIN_ARC * totals.progress;
  els.nextTime.textContent = state.settings.reminderOn ? `下次 ${formatTime(state.reminder.nextAt)}` : "提醒未开启";
  els.countdown.textContent = formatCountdown(); els.snoozeCount.textContent = state.reminder.snoozes;
  els.toggleLabel.textContent = state.settings.reminderOn ? "暂停今日守护" : "开始今日守护";
  els.toggleReminder.classList.toggle("is-paused", state.settings.reminderOn);
  renderCupDots(els.cupRow, totals, false); renderCupDots(els.cupChecklist, totals, true);
}
function renderLog() {
  const entries = ensureDay().entries;
  if (!entries.length) { els.logList.innerHTML = '<div class="empty-log">今天还没有记录。先喝一杯，点一下就行。</div>'; return; }
  els.logList.innerHTML = entries.map((entry) => { const time = new Date(entry.at).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }); const note = drinkNotes.find((drink) => drink.id === entry.noteId); const title = entry.kind === "water" ? `白水 ${entry.amount}ml` : `${note?.name || "饮品"}（备注）`; return `<div class="log-item"><span><b>${title}</b><small>${time}${entry.kind === "note" ? " · 不计入喝水杯数" : ""}</small></span><button class="delete-log" type="button" data-delete-id="${entry.id}" title="删除" aria-label="删除">×</button></div>`; }).join("");
}
function dateFromOffset(offset) { const date = new Date(); date.setDate(date.getDate() - offset); return date; }
function startOfDay(date) { const result = new Date(date); result.setHours(0, 0, 0, 0); return result; }
function daysInMonth(date) { return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(); }
function summaryDates(period) {
  const today = startOfDay(new Date());
  if (period === "week") return Array.from({ length: 7 }, (_, index) => dateFromOffset(6 - index));
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  return Array.from({ length: daysInMonth(today) }, (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1));
}
function totalsForDate(date) { return calculate(state.days[todayKey(date)] || { entries: [] }); }
function streakDays() { let streak = 0; for (let offset = 0; offset < 365; offset += 1) { if (totalsForDate(dateFromOffset(offset)).completed) streak += 1; else break; } return streak; }
function metricMarkup(label, value) { return `<div class="summary-metric"><span>${label}</span><strong>${value}</strong></div>`; }
function periodBuckets(period) {
  const now = new Date();
  const count = period === "quarter" ? 3 : 12;
  return Array.from({ length: count }, (_, index) => {
    const month = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    const today = startOfDay(now);
    const limit = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth() ? today.getDate() : daysInMonth(month);
    const dates = Array.from({ length: limit }, (_, day) => new Date(month.getFullYear(), month.getMonth(), day + 1));
    const totals = dates.map(totalsForDate);
    const water = totals.reduce((sum, total) => sum + total.water, 0);
    const achieved = totals.filter((total) => total.completed).length;
    return { label: month.toLocaleDateString("zh-CN", { year: "numeric", month: "short" }), dates, water, achieved, targetDays: dates.length };
  });
}
function renderSummary() {
  const today = startOfDay(new Date());
  const isLongPeriod = summaryPeriod === "quarter" || summaryPeriod === "year";
  const buckets = isLongPeriod ? periodBuckets(summaryPeriod) : null;
  const dates = isLongPeriod ? buckets.flatMap((bucket) => bucket.dates) : summaryDates(summaryPeriod);
  const usableDates = dates.filter((date) => startOfDay(date) <= today);
  const totals = usableDates.map(totalsForDate);
  const water = totals.reduce((sum, total) => sum + total.water, 0);
  const achieved = totals.filter((total) => total.completed).length;
  const active = totals.filter((total) => total.water > 0).length;
  const target = usableDates.length * state.settings.target;
  els.summaryGrid.dataset.period = summaryPeriod;
  els.summaryMetrics.innerHTML = [
    metricMarkup("累计喝水", `${water}ml`),
    metricMarkup("达成天数", `${achieved} 天`),
    metricMarkup("有记录天数", `${active} 天`),
    metricMarkup("总体完成率", `${target ? Math.round(water / target * 100) : 0}%`),
  ].join("");
  if (isLongPeriod) {
    els.summaryGrid.classList.add("is-period-grid");
    els.summaryGrid.innerHTML = buckets.map((bucket) => {
      const rate = bucket.targetDays ? bucket.achieved / bucket.targetDays : 0;
      return `<div class="summary-period ${rate >= .75 ? "is-done" : "is-missed"}"><span>${bucket.label}</span><strong>${bucket.water}ml</strong><i>${bucket.achieved} / ${bucket.targetDays} 天达成</i></div>`;
    }).join("");
  } else {
    els.summaryGrid.classList.remove("is-period-grid");
    els.summaryGrid.innerHTML = dates.map((date) => {
      const key = todayKey(date);
      const total = totalsForDate(date);
      const future = startOfDay(date) > today;
      const status = future ? "is-future" : total.completed ? "is-done" : "is-missed";
      const label = summaryPeriod === "week" ? date.toLocaleDateString("zh-CN", { weekday: "short" }) : `${date.getDate()} 日`;
      const stateLabel = future ? "未到日期" : total.completed ? "已达成" : total.water ? `还差 ${total.remaining}ml` : "未记录";
      return `<div class="summary-day ${status} ${key === todayKey() ? "is-today" : ""}"><span>${label}</span><strong>${future ? "--" : `${total.water}ml`}</strong><i>${stateLabel}</i></div>`;
    }).join("");
  }
  els.streakLabel.textContent = `连续 ${streakDays()} 天`;
  document.querySelectorAll("[data-summary-period]").forEach((button) => button.classList.toggle("is-active", button.dataset.summaryPeriod === summaryPeriod));
}
function renderInputs() { els.targetInput.value = state.settings.target; els.cupSizeInput.value = state.settings.cupSize; els.intervalInput.value = state.settings.interval; els.startTime.value = state.settings.startTime; els.endTime.value = state.settings.endTime; }
function renderTheme() {
  document.body.dataset.theme = state.settings.theme;
  document.querySelectorAll("[data-theme]").forEach((button) => button.classList.toggle("is-active", button.dataset.theme === state.settings.theme));
}
function render() { renderTheme(); renderInputs(); renderStatus(); renderDrinks(); renderLog(); renderSummary(); }
function updateSetting(key, value) { state.settings[key] = value; if (["interval", "startTime", "endTime"].includes(key)) scheduleNextReminder(); saveState(); render(); syncDesktopSchedule(); }
function bindEvents() {
  els.toggleReminder.addEventListener("click", toggleReminder); els.trayButton.addEventListener("click", () => { if (isDesktop) window.desktop.hideToTray(); else showToast("桌面版关闭窗口后会收进系统托盘"); });
  els.logCup.addEventListener("click", () => addWater(state.settings.cupSize)); els.logHalfCup.addEventListener("click", () => addWater(Math.round(state.settings.cupSize / 2)));
  els.logCustom.addEventListener("click", () => { const amount = Number(els.customAmount.value); if (!amount) { showToast("填入大概的毫升数就行"); return; } addWater(amount); els.customAmount.value = ""; });
  els.remindNow.addEventListener("click", openReminder); els.resetToday.addEventListener("click", resetToday);
  els.drinkGrid.addEventListener("click", (event) => { const button = event.target.closest("[data-drink-id]"); if (button) addDrinkNote(button.dataset.drinkId); }); els.logList.addEventListener("click", (event) => { const button = event.target.closest("[data-delete-id]"); if (button) removeEntry(button.dataset.deleteId); });
  els.targetInput.addEventListener("change", () => updateSetting("target", Math.max(500, Number(els.targetInput.value) || 2000))); els.cupSizeInput.addEventListener("change", () => updateSetting("cupSize", Math.max(150, Number(els.cupSizeInput.value) || 500))); els.intervalInput.addEventListener("change", () => updateSetting("interval", Math.max(15, Number(els.intervalInput.value) || 45))); els.startTime.addEventListener("change", () => updateSetting("startTime", els.startTime.value || "08:00")); els.endTime.addEventListener("change", () => updateSetting("endTime", els.endTime.value || "22:30"));
  document.querySelectorAll("[data-summary-period]").forEach((button) => button.addEventListener("click", () => { summaryPeriod = button.dataset.summaryPeriod; renderSummary(); }));
  document.querySelectorAll("[data-theme]").forEach((button) => button.addEventListener("click", () => updateSetting("theme", button.dataset.theme)));
  els.exportExcel.addEventListener("click", async () => {
    if (!isDesktop) { showToast("请在桌面版中导出 Excel"); return; }
    try {
      const result = await window.desktop.exportXlsx({ days: state.days, settings: state.settings });
      if (!result?.canceled) showToast(`已导出 ${result.filePath.split("/").pop()}`);
    } catch {
      showToast("导出失败，请重试");
    }
  });
}
function collectElements() { ["todayLabel", "trayButton", "toggleReminder", "toggleLabel", "mainGap", "targetCupText", "goalCopy", "cupRow", "logCup", "logHalfCup", "cupAmountLabel", "waterValue", "progressCaption", "progressArc", "targetInput", "cupSizeInput", "intervalInput", "startTime", "endTime", "nextTime", "cupChecklist", "customAmount", "logCustom", "remindNow", "countdown", "snoozeCount", "resetToday", "logList", "drinkGrid", "summaryMetrics", "summaryGrid", "streakLabel", "exportExcel", "toast"].forEach((id) => { els[id] = document.getElementById(id); }); }
async function initDesktop() {
  if (!isDesktop) return;
  const schedule = await window.desktop.getSchedule();
  if (schedule.reminderOn || schedule.nextAt) {
    state.settings.reminderOn = schedule.reminderOn;
    state.settings.interval = schedule.interval;
    state.settings.startTime = schedule.startTime;
    state.settings.endTime = schedule.endTime;
    state.settings.theme = schedule.theme || "light";
    state.reminder.nextAt = schedule.nextAt;
  } else syncDesktopSchedule();
  window.desktop.onScheduleUpdated((scheduleUpdate) => {
    state.settings.reminderOn = scheduleUpdate.reminderOn;
    state.settings.theme = scheduleUpdate.theme || state.settings.theme;
    state.reminder.nextAt = scheduleUpdate.nextAt;
    saveState(); render();
  });
  window.desktop.onReminderAction((action) => {
    if (action === "log") addWater(state.settings.cupSize);
    if (action === "snooze") { state.reminder.snoozes += 1; saveState(); render(); showToast("已延后 5 分钟"); }
    if (action === "skip") { render(); showToast("已跳过本次提醒"); }
  });
  window.desktop.onQuickLog(() => addWater(state.settings.cupSize));
  render();
}
function bootstrap() { ensureDay(); collectElements(); bindEvents(); render(); initDesktop(); setInterval(() => { renderStatus(); dueReminder(); }, 1000); }
bootstrap();
