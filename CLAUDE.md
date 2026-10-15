# 雾都·十八梯（three.js 程序化场景）

- 动手前必读：`docs/DESIGN.md`（规范）和 `docs/tasks/<模块>.md`（任务卡）。
- 无构建步骤：`npm run dev` → http://127.0.0.1:5173/?stats
- 验收：`node tools/check.mjs <module>` 必须 `RESULT: OK`；`node tools/shot.mjs --cams hero,mid,up --out shots/<module>/vN` 截图后用 Read 查看。
- 核心层 `src/core/**`、`src/main.js`、`src/world/layout.js`、`tools/**` 由主控维护，模块 agent 不改。
- 说中文。
