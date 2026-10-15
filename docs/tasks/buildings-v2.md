# 任务卡：buildings v2（适配「山城观景大阶梯」布局）

**文件**：`src/world/buildingsW.js`、`buildingsE.js`、`src/world/lib/tower*.js`、`src/world/lib/side.js`（你独占）
**预算**：各 450k / 40 光场灯 / 60 光晕（当前光场超预算：W 62、E 67，必须降下来）

## 变化
`layout.js` 已改为 v2：阶梯 20 m 宽（`x ∈ [-10, 10]`），地块进深 20 m，楼"近低远高"（楼顶约 42–58，坡顶眼高 41.65）；新增山坡街区 `HW1–4 / HE1–4`（朝南，层层叠落）；路北街区 N1/N2 已删除。详见 `docs/DESIGN.md` §0 §4 §8。

## 要做
1. **删除或改造跨梯连廊**：它现在横在 `hero` 视线正中，挡住远景。远景通廊里（阶梯正上方）不要放任何东西。
2. **光场灯降到 ≤ 40**：只给离阶梯近、低楼层的窗口溢光留灯。
3. **屋顶景观变成主角**：`hero` 从坡顶看过去，近处的楼顶就在视线高度——屋顶要丰富：加建棚屋、菜园、晾衣、水箱、太阳能、屋顶小霓虹、几把撑开的伞、屋顶上的灯泡串。
4. **山坡街区 HW/HE**：从 `hero`、`vista` 看是"层层叠落的山城"：错落的高度、屋顶的层次、零星的亮窗与屋顶灯；不要整齐划一。
5. **V 形取景框**：保持两侧楼不越过 `x = ±10` 向阶梯上空挑出超过 1.2 m；高处悬挑只在远离中轴的一侧。
6. `facades` 服务字段保持兼容（shops / signs / wires / props 会在下一批适配时读取）。

## 自检
- `node tools/check.mjs buildingsW` / `buildingsE` / `monorail` 全部 OK、光场不超。
- `node tools/shot.mjs --only environment,terrain,buildingsW,buildingsE,monorail,signs,weather --cams hero,mid,up,vista --out shots/buildings2/vN`
