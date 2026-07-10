# 喝水小助手

一个 macOS/Windows 桌面小助手，面向需要每天补水 2000ml、但容易忘记喝水的人。

## 下载

请从 [v1.0.0 Release](https://github.com/932425174raul-lgtm/water-reminder-assistant/releases/tag/v1.0.0) 下载对应系统的安装包：

- [macOS Apple Silicon（M1/M2/M3/M4）DMG](https://github.com/932425174raul-lgtm/water-reminder-assistant/releases/download/v1.0.0/water-reminder-assistant-1.0.0-macos-arm64.dmg)
- [Windows x64 EXE](https://github.com/932425174raul-lgtm/water-reminder-assistant/releases/download/v1.0.0/water-reminder-assistant-1.0.0-windows-x64-setup.exe)

macOS 使用说明见 [使用说明.html](./使用说明.html)，Windows 使用说明见 [Windows使用说明.html](./Windows使用说明.html)。

## 做什么

- Electron 主进程在后台按间隔倒计时；主窗口关闭后会收进系统托盘，提醒仍然继续。
- 右下角有一个常驻、不抢焦点的喝水小胶囊；到点后在它上方安静出现提醒条，不响铃、不弹系统通知。
- 胶囊任意位置都可拖动，位置会被记住；精灵环形进度、百分比、毫升数字和进度条都直接对应当天实际喝水量。
- 胶囊提供精灵模式、完全显示和隐藏光条三种形态。精灵模式右下角的展开图标可一键切到完整模式；右键胶囊、右侧光条或系统托盘也可切换显示方式、记录一杯水、打开主窗口或退出应用。
- 主窗口支持浅色和暗黑主题；暗黑主题以水蓝呈现进度，并用金色突出关键读数与状态。
- 常驻胶囊提供 `+1` 一键记录；也可用 `Command/Ctrl + Shift + W` 在任意应用里记录一杯。
- 默认目标 2000ml，并把目标换算为常用杯数：500ml 一杯时，完成 4 杯即可。
- 首页只突出一个动作："我喝了一杯"。支持半杯和补记，避免要求用户精确记录每一口。
- 提醒默认是柔性的：可一键记录、延后 5 分钟或跳过本次；跳过不会关闭后续提醒，并且只在设置的清醒时段触发。
- 无糖茶、碳酸、果汁、奶茶/果茶仅作为可选饮品备注，不折算成喝水量，也不作为奖励机制。
- 应用内可查看本周、本月、本季度、本年的达成情况；可一键导出包含每日、周、月、季度、年度汇总的 Excel 工作簿。
- 所有记录保存在浏览器本地 `localStorage`，不联网、不上传。

## 怎么跑

面向使用者的安装方式：双击 `dist/喝水小助手-1.0.0-arm64.dmg`，将“喝水小助手”拖入“应用程序”后双击打开。无需终端。首次打开若出现未识别开发者提示，按住 Control 点击应用并选择“打开”即可。

开发构建命令：

```bash
cd /Users/songjinzhao/Documents/喝水小助手/20260710-water-reminder-assistant
npm install
npm start
```

生成可分发 DMG：

```bash
npm run dist
```

生成文件位于 `dist/`。

## 文件

- `index.html`：界面结构。
- `main.cjs`：桌面主进程、后台计时、系统托盘与右下角提醒窗口。
- `preload.cjs`：安全的桌面功能桥接层。
- `reminder.*`：到点时的安静提醒条。
- `widget.*`：右下角常驻喝水胶囊。
- `app.js`：一键记录、目标与本地记录。
- `WORKLOG.md`：项目工作记录。

## 备注

设计依据是福格行为模型：在用户已有喝水意愿、喝水本身门槛不高的情况下，产品优先解决"触发"，并把完成和记录压缩为一次点击。
