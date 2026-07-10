const reveal = document.getElementById("reveal");
reveal.addEventListener("click", () => window.desktop.revealWidget());
reveal.addEventListener("contextmenu", (event) => { event.preventDefault(); window.desktop.showWidgetMenu({ x: event.screenX, y: event.screenY }); });
async function refreshTheme() { document.body.classList.toggle("mode-dark", (await window.desktop.getSchedule()).theme === "dark"); }
window.desktop.onScheduleUpdated(refreshTheme);
refreshTheme();
setInterval(refreshTheme, 1000);
