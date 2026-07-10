function todayKey() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function guidance(schedule) {
  const water = schedule.dayKey === todayKey() ? Number(schedule.water || 0) : 0;
  const target = Number(schedule.target || 2000);
  const progress = water / target;
  const hour = new Date().getHours();
  if (hour >= 16 && progress < 0.25) return { title: "下午进度有点落后", note: `今天只有 ${water}ml。饮水明显不足可能出现口渴、口干、疲劳、头晕或尿色变深，先补一杯。` };
  if (progress >= 0.9 && progress < 1) return { title: "快接近今天的目标了", note: `再补 ${Math.max(0, target - water)}ml，就到两升附近。` };
  if (progress >= 0.75) return { title: "已经完成 3/4", note: "最后一小段，慢慢补完就好。" };
  if (progress >= 0.5) return { title: "今天已经过半", note: "保持这个节奏，水灵在旁边陪你。" };
  return { title: "该喝一杯水了", note: "喝完点一下，不需要记每一口。" };
}

async function renderGuidance() {
  const schedule = await window.desktop.getSchedule();
  document.body.classList.toggle("mode-dark", schedule.theme === "dark");
  const content = guidance(schedule);
  document.getElementById("reminderTitle").textContent = content.title;
  document.getElementById("reminderNote").textContent = content.note;
}

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => window.desktop.reminderAction(button.dataset.action));
});
renderGuidance();
