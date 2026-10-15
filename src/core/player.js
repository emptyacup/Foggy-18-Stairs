// 第一人称：WASD 走、Shift 跑、鼠标看（点击锁定指针）、F 切换飞行、Space/C 飞行升降。
import * as THREE from 'three';

export class Player {
  constructor(camera, dom, physics, { eye = 1.65, enabled = true } = {}) {
    this.camera = camera;
    this.physics = physics;
    this.eye = eye;
    this.pos = new THREE.Vector3();     // 脚底位置
    this.yaw = 0; this.pitch = 0;
    this.fly = false;
    this.keys = new Set();
    this.smoothY = null;
    this.enabled = enabled;
    camera.rotation.order = 'YXZ';
    if (!enabled) return;
    dom.addEventListener('click', () => dom.requestPointerLock?.());
    document.addEventListener('mousemove', e => {
      if (document.pointerLockElement !== dom) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = THREE.MathUtils.clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    });
    addEventListener('keydown', e => {
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.fly = !this.fly;
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  // 放置：y 为 null 时贴地
  place(x, y, z, yaw = 0, pitch = 0) {
    this.yaw = yaw; this.pitch = pitch;
    if (y == null) {
      this.pos.set(x, 0, z);
      this.pos.y = this.physics.groundAt(x, z, this.physics.L.heightAt(x, z, true));   // 只认地形附近的可站面，不会落到楼顶
      this.fly = false;
    } else {
      this.pos.set(x, y - this.eye, z);
      this.fly = true;
    }
    this.smoothY = this.pos.y;
    this.apply();
  }

  update(dt) {
    if (this.enabled && dt > 0) {
      const k = this.keys;
      const run = k.has('ShiftLeft') || k.has('ShiftRight');
      const sp = (this.fly ? 14 : 3.2) * (run ? 2.6 : 1);
      const f = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const s = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let mx = fx * f + rx * s, mz = fz * f + rz * s;
      const ml = Math.hypot(mx, mz);
      if (ml > 0) { mx /= ml; mz /= ml; }
      if (this.fly) {
        this.pos.x += mx * sp * dt;
        this.pos.z += mz * sp * dt;
        if (k.has('Space')) this.pos.y += sp * dt;
        if (k.has('KeyC') || k.has('ControlLeft')) this.pos.y -= sp * dt;
        if (f) this.pos.y += Math.sin(this.pitch) * sp * dt * f;
      } else {
        // 冲刺和低帧率时分段移动，不能一帧越过薄扶手/门框。
        const distance = sp * dt;
        const steps = Math.max(1, Math.ceil(Math.hypot(mx, mz) * distance / 0.12));
        for (let i = 0; i < steps; i++) {
          this.pos.x += mx * distance / steps;
          this.pos.z += mz * distance / steps;
          this.physics.resolve(this.pos, 0.35, this.pos.y);
          this.pos.y = this.physics.groundAt(this.pos.x, this.pos.z, this.pos.y);
        }
      }
    }
    // 镜头高度平滑（下台阶不抖）
    if (this.smoothY == null) this.smoothY = this.pos.y;
    this.smoothY += (this.pos.y - this.smoothY) * Math.min(1, dt * 10);
    if (this.fly || dt === 0) this.smoothY = this.pos.y;
    this.apply();
  }

  apply() {
    this.camera.position.set(this.pos.x, (this.smoothY ?? this.pos.y) + this.eye, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
