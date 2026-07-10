function render(schedule) {
  document.body.classList.toggle("mode-compact", schedule.widgetMode === "compact");
  document.body.classList.toggle("mode-dark", schedule.theme === "dark");
  const isCompact = schedule.widgetMode === "compact";
  const modeToggle = document.getElementById("modeToggle");
  const modeLabel = isCompact ? "展开完整喝水胶囊" : "收起为精灵模式";
  modeToggle.setAttribute("aria-label", modeLabel);
  modeToggle.setAttribute("title", modeLabel);
  modeToggle.querySelector("svg").innerHTML = isCompact
    ? '<path d="M8 3H3v5M3 3l6 6M16 21h5v-5m0 5-6-6" />'
    : '<path d="M9 6l6 6-6 6" /><path d="M15 6l6 6-6 6" />';
  const today = new Date().toLocaleDateString("en-CA");
  const water = schedule.dayKey === today ? Number(schedule.water || 0) : 0;
  const target = Number(schedule.target || 2000);
  const progress = Math.min(1, water / target);
  const hour = new Date().getHours();
  const lowAfternoon = hour >= 16 && progress < 0.25;
  const hint = lowAfternoon
    ? "下午进度偏低，先补一杯"
    : progress >= 1 ? "今天已完成，真棒"
      : progress >= 0.9 ? `距离目标只差 ${Math.max(0, target - water)}ml`
        : progress >= 0.75 ? "已完成 3/4，继续保持"
          : progress >= 0.5 ? "已过半，水灵为你鼓掌"
            : `还差 ${Math.max(0, target - water)}ml`;
  document.getElementById("widgetAmount").textContent = `${Math.min(water, target)} / ${target}ml`;
  document.getElementById("widgetHint").textContent = hint;
  document.getElementById("widgetBar").style.width = `${progress * 100}%`;
  document.getElementById("mascotAmount").textContent = `${Math.min(water, target)}ml`;
  document.getElementById("mascotTarget").textContent = `/ ${target}ml`;
  document.getElementById("mascotRing").style.strokeDashoffset = `${238.76 * (1 - progress)}`;
  const widget = document.querySelector(".widget");
  widget.classList.toggle("is-low", progress < 0.25 && !lowAfternoon);
  widget.classList.toggle("is-half", progress >= 0.5 && progress < 0.75);
  widget.classList.toggle("is-three-quarter", progress >= 0.75 && progress < 1);
  widget.classList.toggle("is-complete", progress >= 1);
  widget.classList.toggle("is-health-alert", lowAfternoon);
}

async function refresh() { render(await window.desktop.getSchedule()); }
document.getElementById("openApp").addEventListener("click", () => window.desktop.showMain());
document.getElementById("quickLog").addEventListener("click", () => window.desktop.quickLog());
document.getElementById("modeToggle").addEventListener("click", () => window.desktop.setWidgetMode(document.body.classList.contains("mode-compact") ? "expanded" : "compact"));
window.desktop.onScheduleUpdated(render);
refresh();
setInterval(refresh, 1000);

let drag;
let suppressClick = false;

document.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  drag = { x: event.screenX, y: event.screenY, moved: false };
  window.desktop.startWidgetDrag({ x: event.screenX, y: event.screenY });
});
document.addEventListener("pointermove", (event) => {
  if (!drag) return;
  if (Math.hypot(event.screenX - drag.x, event.screenY - drag.y) > 3) drag.moved = true;
  if (drag.moved) window.desktop.moveWidgetDrag({ x: event.screenX, y: event.screenY });
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  suppressClick = drag.moved;
  drag = undefined;
  window.desktop.endWidgetDrag();
  setTimeout(() => { suppressClick = false; }, 0);
});
document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.desktop.showWidgetMenu({ x: event.screenX, y: event.screenY });
});
document.addEventListener("click", (event) => {
  if (!suppressClick) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
window.desktop.onWidgetModeUpdated((mode) => {
  document.body.classList.toggle("mode-compact", mode === "compact");
  refresh();
});
