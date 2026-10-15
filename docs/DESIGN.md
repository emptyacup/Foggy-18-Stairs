# 雾都·十八梯 —— 设计规范（写给每一个模块 agent）

> 这是一个纯代码程序化生成的 three.js 场景：**重庆山城，雨夜，赛博朋克**。

v3 保留夜景并提高街面可读性，增加可原位切换的阴雨白天（`?day=1`）。左上角“探索路线”说明两侧梯巷、坡顶后街与可进入店铺、通往滨江步道的下行连接。
> 你负责其中**一个模块**。读完本文件再动手。规则是硬性的：违反规则的代码会被 `tools/check.mjs` 拦下或在整合时被退回。

---

## 0. 美术目标（一切取舍以此为准）

画面参考：《银翼杀手 2049》《攻壳机动队》× 重庆山城。关键词：**宏大、湿、密、暖冷对撞、垂直**。

- **宏大（v2 新增，最高优先级）**：主镜头站在坡顶俯瞰——脚下 20 m 宽的大阶梯一路下降，坡底是江，江对岸是 300–800 m 的巨构城：
  巨型屏幕上的人像、江面上几十米高的全息巨人、塔楼之间盘旋的全息龙/锦鲤、成串穿梭的飞车、悬停在城市上空的母舰、刺进云层的光柱与探照灯。
  **尺度对比**是震撼的来源：近处是 0.45 m 的塑料凳和打伞的人，远处是遮天的巨构。
- **湿**：地面是镜子，霓虹在积水里拉成竖向光柱；雨丝在灯光里才可见。
- **密**：阶梯两侧的街面每一米都有东西——但**阶梯中间要留出视线通廊**，不要挡住远景。
- **暖冷对撞**：近处钠灯/火锅店的橙红 vs 远处巨构的青、紫、品红。
- **山城感**：高差。大阶梯、挡墙、层层叠落的山坡楼群、横穿的轻轨。

质量标准：**`hero` 机位截图应该像一张电影海报**。`vista`（高空）与 `terrace`（江边）也要成立。

---

## 1. 运行与工具

```bash
npm run dev                      # http://127.0.0.1:5173/?stats  （WASD 走，F 飞，点击锁鼠标）
node tools/check.mjs <module>    # 无头验收：预算、越界、材质、NaN、动画 300 s。必须 RESULT: OK
node tools/check.mjs <module> --deps   # 带上前置模块一起构建（测服务读取）
node tools/shot.mjs --cams hero,mid,up --out shots/<module>/v1      # GPU 截图
node tools/shot.mjs --only terrain,<module> --cams mid --out shots/<module>/iso   # 隔离调试
node tools/shot.mjs --cams "x,y,z,yaw,pitch" ...   # 自定义机位，y=0 表示贴地（自动加眼高）
node tools/shot.mjs --t 50 ...   # 时间（动画由时间决定，可复现）
node tools/shot.mjs --qs "bloom=0&ssr=0&nan=1"     # 调试：关后处理 / 品红标出 NaN 像素
node tools/shot.mjs --post 0     # 完全绕过后处理
node tools/bench.mjs --cams hero,terrace,vista   # 1080p 真实 GPU 帧率（真实 rAF 循环 + 逐项关后处理）
node tools/cpuprof.mjs           # CPU 采样分析：按函数自耗时排序，找每帧热点
```

截图后**必须用 Read 工具看 PNG**，以美术目标自评。截图输出目录用 `shots/<你的模块名>/`，不要覆盖别人的。

预设机位（`layout.CAMS`）：`hero`（梯坎顶往下看，主镜头）、`mid`（梯坎中段）、`up`（坡底往上看）、`road`（滨江路）、`monorail`、`overview`（鸟瞰）。

---

## 2. 模块契约

```js
// src/world/<name>.js
export function build(ctx) { ... }     // 可以是 async
```

- **只改你自己的文件**：`src/world/<name>.js`，以及你新建的 `src/world/<name>/` 或 `src/world/lib/<name>-*.js`。
- **禁止修改**：`src/core/**`、`src/main.js`、`src/world/layout.js`、`index.html`、`tools/**`、别人的模块。
  核心层缺功能 / 有 bug → 在模块里局部绕过，并在最终报告里写"已知问题 / 需要核心支持"。
- **确定性**：禁止 `Math.random()`，用 `ctx.rng('seed')`。同样的代码每次生成同样的世界。
- **动画只由时间决定**：`ctx.onUpdate((dt, t) => ...)` 里用 `t` 计算状态（截图模式 `dt = 0`）。不要靠 dt 累积。
- **独立可运行**：读其他模块的服务（`ctx.use`）可能拿到 `undefined`，必须用 `layout` 兜底。
- **不要嵌套 Mesh**（Mesh 的子节点又是 Mesh）。用 `THREE.Group` 组织。合批器会把静态 Mesh 拍平。
- 会动的东西放 `ctx.dynamicRoot`，不动的放 `ctx.staticRoot`（构建后自动合批）。

---

## 3. ctx API

| 成员 | 说明 |
|---|---|
| `ctx.L` | `layout.js` 全部导出（坐标、地块、高程函数、机位、预算） |
| `ctx.rng(seed)` | 确定性随机：`r()`, `r.range(a,b)`, `r.int(a,b)`, `r.pick(arr)`, `r.chance(p)`, `r.weighted([[x,w],...])` |
| `ctx.staticRoot / dynamicRoot` | 场景根节点 |
| `ctx.mat.std({...})` | 受光材质（自带霓虹光场 + 雨天湿润/积水）。参数：`color roughness metalness wet(0..1) map emissive emissiveMap emissiveIntensity vertexColors side alphaTest flat opacity` |
| `ctx.mat.surface(name, extra)` | 预设：`asphalt stone concrete concreteDk tile tilePink tileGreen plaster brick grime metal metalDk rust glass wood plastic tarpRed` |
| `ctx.mat.neon(color, intensity)` | 自发光（不受光）。intensity > 1.2 会产生泛光 |
| `ctx.mat.emissiveMap(tex, intensity)` | 带贴图的自发光（灯箱、屏幕、亮着的店内） |
| `ctx.mat.glow(color, intensity)` | 加法混合辉光（不写深度） |
| `ctx.mat.custom(shaderMaterial)` | 登记自定义 ShaderMaterial（必须走这里） |
| `ctx.tex.neonText(text, {vertical, style:'tube'|'box'|'led', color, color2, sub})` | 霓虹字/灯箱贴图 → `{texture, aspect}` |
| `ctx.tex.facade / paving / grille / radial / canvas(w,h)` | 立面、石板、格栅、光晕贴图；`canvas()` 给你自己画 |
| `ctx.make.block(w,h,d,mat,{x,y,z,ry,uv,solid})` | 盒子，**(x,y,z) 是底面中心**；`uv`=贴图每 N 米重复；`solid` 登记碰撞 |
| `ctx.make.quad(w,h,mat,{x,y,z,ry,rx})` | 平面（中心定位，法线 +Z） |
| `ctx.make.neonSign({text,pos,ry,vertical,style,color,color2,size,sub,double,flicker})` | 完整招牌（板+字+光场+光晕+闪烁）。**pos = 顶部挂点** |
| `ctx.make.lightCone({pos,dir,length,radius,color,intensity})` | 雨雾中的体积光锥 |
| `ctx.lights.add({position,color,intensity,radius})` | 登记光场点光（返回句柄，可改 `intensity/position` 做闪烁、移动） |
| `ctx.halos.add({position,color,size,intensity})` | 雾中光晕（静态位置；句柄可改 intensity） |
| `ctx.wires.add(a,b,{sag,r,color})` | 悬链线电线（合并成一个网格；三角面按调用模块记账） |
| `ctx.physics.addBox(x0,z0,x1,z1,top,bottom)` | 碰撞盒 |
| `ctx.onUpdate(fn)` | 每帧 `fn(dt, t)` |
| `ctx.provide(name, v) / ctx.use(name)` | 跨模块服务 |
| `ctx.shared.uTime / uRain` | 全局 uniform |

**禁止**：`THREE.PointLight/SpotLight/...`（用 `ctx.lights.add`）；自己 `new MeshStandardMaterial`（用 `ctx.mat`）；外部图片/模型/字体文件。

---

## 4. 坐标与世界地图（权威来源：`src/world/layout.js`，v2「山城观景大阶梯」）

- 单位**米**；**+X 东，-Z 北（下坡 / 主视线方向），+Y 上**。
- 坡顶广场 `y=40`，`z ∈ [-8, 10]`（含 `z ∈ [2, 9]` 一条东西向街道）。主镜头站在这里往北俯瞰。
- 大阶梯：`x ∈ [-10, 10]`（**20 m 宽**），`z` 从 `-8` 降到 `-100`，`y` 从 40 降到 10。梯段/平台见 `L.FLIGHTS`；`x = ±3.4` 有两条分道扶手。
  - 任意点地面：`L.heightAt(x, z)`（台阶离散），`L.heightAt(x, z, true)`（平滑坡）。山坡区域（|x|>10）也返回该 z 处的阶梯高度。
- 两侧地块 `L.LOTS`：西 W1–W5 立面在 `x=-10` 朝东，东 E1–E5 立面在 `x=10` 朝西，进深 20 m。**近低远高**（楼顶约 42–58），形成 V 形取景框。
  底商层顶 `podiumTop` 见 `facades` 服务（兜底：`max(stairHeightAt(z0), stairHeightAt(z1)) + 4.2`）。
- 山坡街区 `L.BLOCKS` 中 `HW*/HE*`：|x| 33–100，层层叠落，朝南；`S1/S2` 在坡顶广场背后。
- 坡底观景平台 `L.PLAZA`：`y=10`，`z ∈ [-100, -122]`，北缘有栏杆；`z ∈ [-122,-126]` 是 10 m 挡墙（`L.WALL`）。
- 滨江路 `L.ROAD`：`y=0`，`z ∈ [-126, -146]`，双向 4 车道 + 两侧 3 m 人行道；斑马线在 `x ≈ -30`。
- 江堤 `z=-150`，江面 `y=-4`。
- 轻轨 `L.MONORAIL`：轨道梁顶 `y=14`，沿 `z=-148` 东西横穿镜头中景；东侧穿过站楼 `x ∈ [56, 80]`。
- 巨构城 `L.MEGA`：江对岸 `z ∈ [-380, -1400]`。中央地标「雾都塔」`(-40, -620)` 高 820 m；全息巨人站在江面 `(130, -330)` 高 140 m；母舰悬停 `(-150, y=520, -900)`；飞车航道高度 `L.MEGA.skyLanes`。
- 预设机位：`hero`（坡顶俯瞰）、`mid`、`up`（坡底回望）、`terrace`（江边栏杆）、`road`、`vista`（高空）、`overview`。
- 尺度参考：层高 3 m；门 2.1×0.9；塑料凳高 0.45；电瓶车 1.7×0.6×1.1；人 1.6–1.75；踏步 0.16×0.34。

---

## 5. 美术规则

1. **颜色只从 `src/core/palette.js` 取**。`BASE` 给受光表面，`NEON` 只给发光体，`WINDOW` 给室内灯。
2. **受光表面**用 `ctx.mat.std / surface`。室外表面 `wet=1`，室内 / 雨棚下 `wet=0~0.3`。
3. **发光体**强度：招牌 1.8–3；室内灯光面 1.2–2.2；小灯珠 3–6。不要整面墙都发光。
4. **每个发光体都要照亮周围**：较大的发光物配一个 `ctx.lights.add`（半径 4–12 m）。没有光场的霓虹看起来像贴纸。
5. **轮廓要碎**：真实街景没有完整的长方体。给盒子加檐口、门框、凹进、管线、污渍、杂物，打破轮廓。
6. **高度分层**：0–2.5 m 人的尺度（凳子、货架、人），2.5–4.5 m 雨棚和招牌下沿，4.5 m 以上竖招牌、电线、阳台。
7. **净空**：梯坎中线左右各 1.5 m（`|x| < 1.5`）、离地 2.4 m 以内**不放障碍物**，保证人能走。
8. 店名、品牌一律**虚构**，不要用真实商标。
9. 雨夜里，黑是常态，**亮的地方要少而准**。先保证构图，再加亮点。

---

## 6. 性能预算（`layout.BUDGET`，check 强制）

| 模块 | 三角面 | 光场灯 | 光晕 |
|---|---|---|---|
| environment | 300k | 12 | 500 |
| terrain | 260k | 30 | 60 |
| buildingsW / E | 各 450k | 各 40 | 各 60 |
| monorail | 180k | 24 | 80 |
| signs | 160k | 240 | 260 |
| shops | 260k | 120 | 120 |
| traffic | 160k | 60 | 160 |
| props | 220k | 40 | 60 |
| wires | 90k | 0 | 40 |
| characters | 200k | 0 | 0 |
| weather | 80k | 0 | 0 |
| megacity | 400k | 8 | 400 |
| hologram | 150k | 6 | 40 |
| aircraft | 250k | 10 | 300 |

- 重复物体（凳子、筐、车）用 `THREE.InstancedMesh`，或靠静态合批。
- 单个模块 Canvas 纹理 ≤ 24M 像素；同类纹理复用（tex 函数自带缓存）。
- 目标：GTX 1660 级显卡 1080p 下 60 fps。

---

## 7. 跨模块服务

| 服务名 | 发布者 | 内容 |
|---|---|---|
| `facades` | buildingsW/E | 立面数组：`{id, face, ry, normal, tangent, origin, length, ground, podiumTop, top, floors, bays, floorH, bayW, frontPlane, point(u, y, out)}`。`point` 把立面坐标转成世界坐标（u 沿立面，y 绝对高度，out 向外） |
| `stationFacade` | monorail | 穿楼站楼的南立面 |
| `shopfronts` | shops | 店面数组 `{facadeId, u0, u1, floorY, top, kind}`，供 props / characters 定位 |
| `walkways` | props | 道具占用区 `{x0,z0,x1,z1}`，供 characters 避让 |

没有服务时用 `layout.LOTS` + `heightAt` 兜底（参考 `signs.js` 的 `fallbackFacades`）。

---

## 8. 所有权（谁负责什么、空间边界）

区域见 `layout.ZONES`，check 会报越界。

| 模块 | 负责 |
|---|---|
| environment | 天空云层之外的远景底色：最远处天际线填充、江面、远处跨江大桥 |
| terrain | 所有地面、台阶、挡墙、路面、江堤、**全部路灯** |
| buildingsW/E | 阶梯两侧楼体、山坡街区、坡顶背后街区（`lib/tower*.js`, `lib/side.js`） |
| monorail | 轻轨梁、墩、站楼、列车 |
| megacity | 江对岸巨构塔楼、**巨型屏幕（含程序化人像）**、塔顶光柱、探照灯 |
| hologram | 江面全息巨人、塔楼间的全息龙 / 锦鲤等大型全息体 |
| aircraft | 母舰、飞车航道车流、广告飞艇（带屏幕）、警用飞行器 |
| shops | 阶梯两侧底商层店面（`podiumTop - 1.0` 以下，立面外 0–2.2 m） |
| exploration | 两侧实体梯巷、坡顶后街、真实可进入茶馆/杂货店、平台到滨江的下行阶梯和局部门洞；地表由 `L.walkHeightAt` 读取，遮雨区发布 `rainShelters` |
| signs | 所有街面招牌（含底商灯箱带 `[podiumTop-1.0, podiumTop]`）、牌坊 |
| wires | 头顶电线、电缆束、电线杆、晾衣绳、灯串（**不得横穿阶梯中线视线通廊 `|x|<6` 的 y > 坡面+3 m 区域**，以免挡远景） |
| props | 街面道具（阶梯两侧 `|x| ∈ [5, 10]` 为主，中线 `|x|<3` 保持畅通） |
| traffic | 滨江路与坡顶街道的车辆、红绿灯 |
| characters | 行人 |
| weather | 雨丝、水花 |

---

## 9. 验收流程（每个 agent 照做）

1. 读本文件 + 你的任务卡 `docs/tasks/<module>.md` + `layout.js` + 一个参考模块（`signs.js` / `lib/tower.js`）。
2. 写代码 → `node tools/check.mjs <module>` → 修到 `RESULT: OK`。
3. `node tools/shot.mjs --cams hero,mid,up --out shots/<module>/vN` → **Read 每张图**，对照第 0 节自评。
4. 至少迭代 3 轮截图。每轮写一句"这轮改了什么、画面变好在哪里"。
5. 收尾：`node tools/check.mjs` 全量通过；截图无 NaN 黑屏 / 品红。
6. 最终报告：做了什么、截图路径、预算使用情况、已知问题、需要核心层支持的点。

## 10. 已知坑

- **性能**（2026-10-15 实测，GTX 1660 Ti / 1080p）：主视角约 65 fps、江边 90、高空 86。瓶颈在 GPU 处理大量 draw call 与楼体细节，不在像素填充（MSAA、灯数、分辨率影响都很小）。运行时有动态分辨率兜底（`?dynres=0` 关闭，`?stats` 可看当前比例）。
- **每帧热路径禁止 `Color.set(hex)` / `new THREE.Color()`**：会反复做 sRGB→线性转换。构建时转换好并缓存（参考 `traffic.js` 的 `cachedColor`）。
- 光场数据在一张浮点纹理里（`lfPos(i)` / `lfCol(i)`，见 `lights.js` 的 `LIGHTFIELD_DECL`），自定义 shader 用 `LIGHTFIELD_GLSL` 并传 `uLPos: ctx.lights.uPos`、`uLCount: ctx.lights.uCount`。
- 合批会把"只差颜色、无贴图"的材质折叠成共享材质 + 顶点色。若某个静态网格的材质要在运行时改颜色，必须用带 `uid` 的独立材质（`ctx.mat.neon(c, k, { uid: '...' })`），否则颜色会被烘死。

- GLSL 里 `pow(x, y)` 的 x 为负 → NaN → 经过 bloom 整屏发黑。插值量先 `clamp`。
- 合批会把 `staticRoot` 下所有 Mesh 拍平，之后不能再改它们的 transform。要动的放 `dynamicRoot`。
- 加法混合透明物会被合批；普通透明（需要排序）不会。尽量不用普通透明，镂空用 `alphaTest`。
- `make.neonSign` 的 `pos` 是**顶部**，招牌向下展开。
- 截图模式 `dt = 0`：别在 update 里用 dt 积分位置。
