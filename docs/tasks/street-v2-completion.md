# 街景 v2 接续记录（2026-10-14）

沿用 DESIGN.md 与 street-v2.md，完成第一批核验与第二批 A/B/C 整合。

## 修改文件与原因

- `src/world/shops.js`：底商设施读取楼体 fixtures 避让，更新路灯位置。
- `src/world/signs.js`：竖牌整块限制在两侧 8.5–10 m，灯箱限制在底商招牌带；屋顶大字集中近处低楼；保留牌坊并移至坡顶广场 z=0，退出阶梯视线通廊。
- `src/world/lib/shops-signs-fixtures.js`：统一楼体与基座立面坐标下的 fixtures 避让判断。
- `src/world/props.js`：道具、外摆布置在两侧并避开路灯和电杆；长椅与望远镜移到观景平台；道路人行道高程读取 layout。
- `src/world/wires.js`：电线、灯串和晾衣改成同侧连接；电杆避开路灯，发布 wirePoles 占位；仅一侧楼体服务可用时，按 LOTS 补全另一侧兜底立面。
- `src/world/traffic.js`、`src/world/lib/traffic-signals.js`：滨江路四车道、坡顶路、停止线和信号灯适配新布局，过街中心统一为 x=-30。
- `src/world/characters.js`：两侧阶梯、平台、观江剪影与滨江过街路线适配；行人读取 walkways 避让。
- `src/world/environment.js`：旧天际线移到巨构城之后，本岸楼群向两侧留出江心视线；保留江面、大桥和光带，光带固定在实际江段内。
- `src/world/lib/megacity-gl.js`：补倒影片元 shader 的 uWaterY 声明，修复真实 GPU 上的编译失败。
- `tools/shot.mjs`：浏览器 console error、pageerror、requestfailed 使截图验收返回失败。
- `docs/DESIGN.md`：电线通廊规则由坡面以上 8 m 统一为任务卡规定的 3 m。

未新增依赖，未修改 core、main 或 layout；本目录没有 Git 仓库，未提交。

## 验证

- src/tools 共 70 个 JS/MJS 文件通过 node --check；最后两项修复后，相关四文件再次语法检查通过。
- `node tools/check.mjs`：15 模块全部 RESULT: OK，全部 outOfZone=0，无警告或错误。最终输出保存于 `shots/codex/check-final.txt`。
- 六个街景模块均独立与 --deps 检查通过。
- 街景联合构建审计：409,173 个几何顶点；阶梯 |x|<6、坡面+3 m 以上违规顶点 0，电线采样违规 0，walkways 与 |x|<3 中线重叠 0。
- `buildingsW → wires`、`buildingsE → wires` 分别构建通过；环境 114 条光带超出实际江段数量 0。
- 行人/车辆 agent 对 0–300 s、每 0.25 s 的矩阵与过街状态采样：非法矩阵 0、动画越界 0、机动车绿灯时道路斑马线行人 0。
- NVIDIA GTX 1660 Ti 真实 GPU 渲染：30/50/90 s，hero、mid、up、terrace、road、vista 六机位截图均已查看，无模块错误与 shader 编译错误；复查修复后再跑全部六机位。

## 截图轮次

1. `shots/codex/first-batch_*`：隔离旧街景，发现倒影片元编译错误和旧楼群遮挡。
2. `shots/codex/first-batch-fixed_*`：倒影片元修复，GPU 无错误。
3. `shots/codex/integration-v1_*`（30 s）：第二批整合，旧楼群让出江心，两侧街景密度与通廊成立。
4. `shots/codex/integration-v2_*`（50 s）：外摆避让收尾，检查列车经过、车流绿灯与全息姿态。
5. `shots/codex/integration-v3_*`（90 s）：检查广告/脸谱切换及行人、车辆另一个时刻。
6. `shots/codex/final_*`（30 s）：单侧立面兜底与环境光带修复后最终验收。

最终场景约 1.169 M 三角面、297 光场登记、595 光晕、32.6 M 总纹理像素；主机位约 514 draws，各模块均在预算内。

## 已知限制

- 静态截图验证未测实时帧率，不能据此保证 1080p 60 fps。
- 当前 hero 机位保留原有构图，高处母舰和塔冠不完整入镜；全息巨人在江边/高空机位更易辨认。
- 坡顶道路范围仍由 UPPER 派生，过街偏移与 terrain 共用既有 30 m 约定，未新增配置。

预览：`npm run dev`，打开 `http://127.0.0.1:5173/?stats`；本次交付时已启动该服务。
