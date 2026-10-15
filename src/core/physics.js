// 极简碰撞：XZ 平面上的轴对齐盒子 + layout.heightAt 地面。够第一人称漫步用。
export class Physics {
  constructor(layout) { this.L = layout; this.boxes = []; }

  // 盒子：x0<x1, z0<z1（注意这里 z0 是较小值），top = 顶面高度，bottom = 底面
  addBox(x0, z0, x1, z1, top, bottom = -100) {
    this.boxes.push({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), top, bottom });
  }

  // 脚下地面：layout 地形 与 可站上去的盒子顶（不高于 feet+step）
  groundAt(x, z, feetY, step = 0.45) {
    let g = (this.L.walkHeightAt || this.L.heightAt)(x, z, true);
    for (const b of this.boxes) {
      if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 && b.top <= feetY + step && b.top > g) g = b.top;
    }
    return g;
  }

  // 圆形角色与盒子的水平推出
  resolve(pos, radius, feetY, step = 0.45) {
    for (const b of this.boxes) {
      if (b.top <= feetY + step || b.bottom > feetY + 1.8) continue;
      const cx = Math.max(b.x0, Math.min(pos.x, b.x1));
      const cz = Math.max(b.z0, Math.min(pos.z, b.z1));
      const dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2), k = (radius - d) / d;
        pos.x += dx * k; pos.z += dz * k;
      } else {      // 中心已在盒内：沿最短轴推出
        const opts = [[b.x0 - radius - pos.x, 0], [b.x1 + radius - pos.x, 0], [0, b.z0 - radius - pos.z], [0, b.z1 + radius - pos.z]];
        opts.sort((a, c) => Math.abs(a[0] + a[1]) - Math.abs(c[0] + c[1]));
        pos.x += opts[0][0]; pos.z += opts[0][1];
      }
    }
  }
}
