// 光晕：雨雾中灯光周围的散射光团。所有光晕合并成一个 InstancedMesh（1 个 draw call）。
// 模块调用 ctx.halos.add({...}) 拿到句柄；可在 update 里改 handle.intensity 实现闪烁。
import * as THREE from 'three';

export class Halos {
  constructor() { this.items = []; this.mesh = null; }

  add({ position, color = 0xffffff, size = 2, intensity = 1 }) {
    const h = {
      position: position.clone ? position.clone() : new THREE.Vector3(...position),
      color: new THREE.Color(color), size, intensity, _i: -1,
    };
    this.items.push(h);
    return h;
  }

  build() {
    const n = this.items.length;
    if (!n) return null;
    const geo = new THREE.PlaneGeometry(1, 1);
    const aCol = new Float32Array(n * 3), aSize = new Float32Array(n);
    const mat = new THREE.ShaderMaterial({
      uniforms: { fogDensity: { value: 0.01 } },
      vertexShader: /* glsl */`
        attribute vec3 aCol; attribute float aSize;
        varying vec2 vUv; varying vec3 vCol;
        uniform float fogDensity;
        void main(){
          vec3 c = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
          vec4 mv = viewMatrix * vec4(c, 1.0);
          float d = -mv.z;
          mv.xy += position.xy * aSize;
          mv.z += min(aSize * 0.45, d * 0.5);        // 往相机方向挪，减少穿墙硬边
          gl_Position = projectionMatrix * mv;
          vUv = uv;
          float fog = exp(-d * fogDensity * 0.55);
          vCol = aCol * fog * smoothstep(0.5, 3.0, d);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; varying vec3 vCol;
        void main(){
          float r = length(vUv - 0.5) * 2.0;
          float a = exp(-r * r * 5.0) * 0.9 + exp(-r * r * 40.0) * 0.6;
          a *= smoothstep(1.0, 0.8, r);
          gl_FragColor = vec4(vCol * a, 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    mat.userData.ctxMat = true; mat.userData.custom = true;
    const mesh = new THREE.InstancedMesh(geo, mat, n);
    const m = new THREE.Matrix4();
    this.items.forEach((h, i) => {
      h._i = i;
      m.makeTranslation(h.position.x, h.position.y, h.position.z);
      mesh.setMatrixAt(i, m);
      aSize[i] = h.size;
    });
    geo.setAttribute('aCol', new THREE.InstancedBufferAttribute(aCol, 3));
    geo.setAttribute('aSize', new THREE.InstancedBufferAttribute(aSize, 1));
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.userData.noBatch = true;
    this.mesh = mesh;
    this.writeColors();
    return mesh;
  }

  writeColors() {
    if (!this.mesh) return;
    const a = this.mesh.geometry.attributes.aCol;
    for (const h of this.items) {
      a.array[h._i * 3] = h.color.r * h.intensity;
      a.array[h._i * 3 + 1] = h.color.g * h.intensity;
      a.array[h._i * 3 + 2] = h.color.b * h.intensity;
    }
    a.needsUpdate = true;
  }
}
