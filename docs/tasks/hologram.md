# 任务卡：hologram（巨型全息体）

**文件**：`src/world/hologram.js`（可建 `src/world/hologram/`）
**预算**：150k 三角面 / 6 光场灯 / 40 光晕

## 目标
赛博朋克最标志的画面：**江面上站着一个 140 m 高的半透明全息女性**（致敬《银翼杀手 2049》的 Joi），缓慢地转头、抬手；以及**在巨构塔楼之间盘旋游动的全息中国龙**和一群在空中游弋的**全息锦鲤**。

## 内容
1. **全息巨人**（`L.MEGA.holo`，站在江面 `y = L.Y_RIVER`）：
   - 造型：风格化女性全身（流畅的轮廓：用 Lathe/曲线/细分的低多边形组合，头发是几片飘动的带状面，长裙或紧身衣）。不能是方块人。
   - 动作（只由 t 决定）：呼吸起伏、缓慢转头看向镜头方向、一只手抬起再放下，周期 20–40 s。
   - 全息 shader：菲涅尔边缘高亮、内部半透明、水平扫描线、自下而上的扫光、偶发的横向切片错位（glitch）与闪烁、颜色青 + 品红渐变；加法混合，不写深度。
   - 脚下在江面上有一圈投影光环和拉长的倒影光柱。
2. **全息龙**：长 300–500 m，身体是沿时间移动的样条管（鳞片图案用 shader 画），龙头有角和须的轮廓，在雾都塔（`L.MEGA.hero`）周围或塔群之间盘旋。金色/青色全息。
3. **全息锦鲤**：15–30 条，每条 8–20 m，红白/金色，在塔楼之间或江面上空成群游动，尾巴摆动。
4. 全部用 `ctx.mat.custom(new THREE.ShaderMaterial(...))`，动画写在 shader 里（uniform uTime = `ctx.shared.uTime`）。

## 自检
- `hero`、`terrace`、`vista`：巨人在 hero 里要清晰可辨（剪影、发光边），但不能抢走巨构城的风头——它是"画面里的人"。
- `node tools/shot.mjs --only environment,terrain,buildingsW,buildingsE,monorail,megacity,hologram,weather --cams hero,terrace,vista --out shots/hologram/vN`，多试几个 `--t`。
- 注意 megacity agent 同时在改远景，雾都塔位置以 `L.MEGA.hero` 为准。
