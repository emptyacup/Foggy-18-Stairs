// Paved back lanes, a recessed river stair and two rooms with actual open doors.
import * as THREE from 'three';
import { BASE, NEON, WINDOW } from '../core/palette.js';
import { CN_FONT } from '../core/tex.js';

export function build(ctx) {
  const { L, make, mat, tex } = ctx;
  const E = L.EXPLORATION;
  const stone = mat.surface('stone', { map: tex.paving('pave-a'), wet: 1 });
  const concrete = mat.surface('concrete');
  const metal = mat.surface('metalDk');
  const wall = mat.surface('plaster', { map: tex.paving('wall'), wet: 0.12 });
  const wood = mat.surface('wood', { wet: 0 });
  const tile = mat.surface('tileGreen', { wet: 0 });
  const floor = mat.surface('tileGreen', { map: tex.paving('step'), wet: 0 });
  const leaves = mat.std({ color: BASE.green, roughness: 0.85, wet: 0.3 });
  const glass = mat.surface('glass', { color: BASE.glassDk, wet: 0.2 });
  const notice = (lines) => {
    const canvas = tex.canvas(512,512), g = canvas.getContext('2d');
    g.fillStyle = '#'+BASE.wood.toString(16); g.fillRect(0,0,512,512);
    g.strokeStyle = '#'+BASE.tileGreen.toString(16); g.lineWidth=12; g.strokeRect(8,8,496,496);
    g.fillStyle = '#'+BASE.tileWhite.toString(16); g.textAlign='center'; g.textBaseline='middle';
    lines.forEach((line,i) => {g.font=`${i===0?'bold ':''}${i===0?55:37}px ${CN_FONT}`;g.fillText(line,256,72+i*78);});
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    return mat.std({map:texture,roughness:0.9,wet:0});
  };
  const laneNotice = notice(['梯后里','慢行 · 当心台阶','夜归请轻声','通往滨江步道']);
  const cylinder = (r,h,x,y,z,material,segments=10,rTop=r) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rTop,r,h,segments),material);
    mesh.position.set(x,y+h/2,z); ctx.staticRoot.add(mesh); return mesh;
  };
  const goods = [BASE.tilePink,BASE.tileGreen,BASE.plastic,BASE.tarpRed,BASE.tileWhite]
    .map(color => mat.std({ color, roughness: 0.7, wet: 0 }));
  const slab = (x0,x1,z0,z1,y) => make.block(x1-x0,0.4,z0-z1,stone,
    { x:(x0+x1)/2,y:y-0.4,z:(z0+z1)/2,uv:2 });
  const rail = (a,b) => {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.07,end.distanceTo(start),0.07),metal);
    mesh.position.copy(start).add(end).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());
    ctx.staticRoot.add(mesh);
  };
  const lamp = (x,y,z,color,intensity = 1.6) => {
    make.block(0.6,0.09,0.18,mat.neon(color,2.2),{x,y,z});
    ctx.lights.add({position:[x,y-0.1,z],color,intensity,radius:7});
    ctx.halos.add({position:[x,y,z],color,size:1.3,intensity:0.24});
  };

  // 山坡横巷（districts）与梯巷交汇处：外侧路沿和扶手断开
  const hillLanes = (L.DISTRICTS?.hill?.lanes ?? []).map(l => ({ z0: l.mz0 ?? l.z0, z1: l.mz1 ?? l.z1 }));
  const inLane = (z, pad = 0) => hillLanes.some(l => z > l.z0 - pad && z < l.z1 + pad);
  // The narrow gap between existing rear walls (x=30) and hill blocks (x=33).
  for (const s of [-1,1]) {
    const x = s*E.lane.x;
    for (const f of L.FLIGHTS) {
      if (f.type === 'landing') {
        slab(x-E.lane.width/2,x+E.lane.width/2,f.z0,f.z1,f.y0);
        for (const edge of [-1,1]) {
          // 外侧路沿按横巷切段
          const cuts = edge === s ? hillLanes.filter(l => l.z1 > f.z1 && l.z0 < f.z0) : [];
          let segs = [[f.z1, f.z0]];
          for (const l of cuts) segs = segs.flatMap(([a,b]) => [[a, Math.min(b, l.z0)], [Math.max(a, l.z1), b]]).filter(([a,b]) => b - a > 0.05);
          for (const [a,b] of segs) make.block(0.12,0.65,b-a,concrete,{x:x+edge*1.39,y:f.y0,z:(a+b)/2,solid:true});
        }
      }
      else for (let i=0;i<f.steps;i++) {
        const y = f.y0-(i+1)*f.rise, z = f.z0-(i+0.5)*f.run;
        make.block(E.lane.width,0.45,f.run+0.006,stone,{x,y:y-0.45,z,uv:2});
        for (const edge of [-1,1]) if (edge !== s || !inLane(z, 0.17)) make.block(0.12,0.65,f.run+0.006,concrete,
          {x:x+edge*1.39,y,z,solid:true});
      }
      if (f.type === 'flight') {
        // Wall-side handrails keep the centre clear and follow the real rise.
        for (const edge of [-1,1]) {
          const rx = x+edge*1.31;
          const yAt = z => f.y0 + (f.y1-f.y0)*(f.z0-z)/(f.z0-f.z1) + 0.95;
          let segs = [[f.z1, f.z0]];
          if (edge === s) for (const l of hillLanes) segs = segs.flatMap(([a,b]) => [[a, Math.min(b, l.z0)], [Math.max(a, l.z1), b]]).filter(([a,b]) => b - a > 0.3);
          for (const [a,b] of segs) rail([rx,yAt(b),b],[rx,yAt(a),a]);
          for (let z=f.z0-0.3;z>f.z1;z-=2) if (edge !== s || !inLane(z, 0.1)) make.block(0.04,0.95,0.04,metal,{x:rx,y:L.stairHeightAt(z),z});
        }
      }
    }
    slab(x-1.4,x+1.4,-100,-108,10);
    for (const z of [-30,-62,-94]) {
      const y = L.stairHeightAt(z)+2.5;
      make.block(0.05,2.5,0.05,metal,{x:x+s*1.25,y:y-2.5,z});
      lamp(x+s*1.25,y,z,WINDOW.warm);
    }
    make.neonSign({text:s<0?'西巷 · 滨江':'东巷 · 观景',pos:[x,42.8,-5],size:0.27,color:NEON.amber,light:false,halo:false});
    for (const zz of [-27,-51,-79]) {
      const yy=L.stairHeightAt(zz), px=s*30.12;
      cylinder(0.045,3.4,px,yy+0.7,zz,metal,8);
      for (const dy of [1,2.8]) make.block(0.13,0.05,0.17,metal,{x:px,y:yy+dy,z:zz});
      make.quad(0.7,0.7,laneNotice,{x:s*30.13,y:yy+1.65,z:zz-1,ry:s*Math.PI/2});
      make.block(0.12,0.65,0.25,metal,{x:px,y:yy+0.66,z:zz+0.25});
    }
  }

  // Existing blocks remain intact; their central 12m gap leads to this rear street.
  slab(-6,6,24,10,40);
  slab(E.backstreet.x0,E.backstreet.x1,40,24,40);
  for (const x of [-54,54]) make.block(0.2,0.55,16,concrete,{x,y:40,z:32,solid:true});
  // 后街南侧矮墙：有新街区（districts）时由临街楼与牌坊取代，不再建
  if (!L.DISTRICTS?.south) make.block(110,0.55,0.2,concrete,{x:0,y:40,z:39.9,solid:true});
  for (const x of [-31,-27,27,31]) {
    cylinder(0.35,0.45,x,40,30,mat.surface('rust'),10,0.42);
    cylinder(0.3,0.035,x,40.42,30,wood);
    for (let i=0;i<5;i++) {
      const a=i*Math.PI*2/5;
      const mesh=new THREE.Mesh(new THREE.SphereGeometry(0.16,7,5),leaves);
      mesh.scale.set(1,2.7,1);mesh.position.set(x+Math.cos(a)*0.17,40.8,30+Math.sin(a)*0.17);ctx.staticRoot.add(mesh);
    }
  }
  for (const x of [-38,38]) {
    make.block(0.8,0.45,0.6,wood,{x,y:40,z:25.4,solid:true});
    make.block(0.74,0.35,0.55,wood,{x:x+0.08,y:40.45,z:25.4,solid:true});
    for (let k=0;k<5;k++) make.block(0.78,0.025,0.03,metal,{x,y:40.07+k*0.075,z:25.71});
  }

  const d = E.descent, run = (d.x1-d.x0)/d.steps, rise = 10/d.steps;
  for (let i=0;i<d.steps;i++) {
    const x=d.x0+(i+0.5)*run, y=10-(i+1)*rise;
    make.block(run+0.003,0.4,d.width,stone,{x,y:y-0.4,z:d.z,uv:2});
    for (const s of [-1,1]) {
      const z=d.z+s*(d.width/2+0.08);
      // Short railing collisions preserve the slope, rather than one tall AABB.
      if (i%5===0) make.block(0.045,1.0,0.045,metal,{x,y,z});
      ctx.physics.addBox(x-run/2,z-0.035,x+run/2,z+0.035,y+1.05,y-0.1);
    }
  }
  for (const s of [-1,1]) rail([d.x0,11,d.z+s*1.78],[d.x1,1,d.z+s*1.78]);
  slab(-35,-29,-121.8,-129,0);
  slab(-32,-26,-115,-122,0);
  // Solid retaining edges protect the excavation, with the west landing left open.
  make.block(30,10,0.22,concrete,{x:-41,y:0,z:-115.05,solid:true});
  make.block(0.22,10,7,concrete,{x:-26.1,y:0,z:-118.5,solid:true});
  for (const y of [10.55,11.1]) make.block(30,0.06,0.06,metal,{x:-41,y,z:-115.05});
  ctx.physics.addBox(-56,-115.2,-26,-114.9,11.2,9.9);
  make.neonSign({text:'滨江步道 ↓',pos:[-55,12.5,-114.9],size:0.35,color:NEON.cyan,light:false,halo:false});
  lamp(-56,12.2,-118,WINDOW.warm);
  lamp(-32,2.6,-124,WINDOW.fluor);
  make.neonSign({text:'梯巷出口',pos:[-32,2.9,-126.12],ry:Math.PI,size:0.3,color:NEON.teal,light:false,halo:false});

  for (const room of E.interiors) {
    const x=room.x, y=room.y, depth=room.z1-room.z0, z=(room.z0+room.z1)/2;
    // Each front wall is split at the 2.4m door. No box spans the doorway.
    make.block(room.width,0.3,depth,floor,{x,y:y-0.3,z,uv:2});
    for (const s of [-1,1]) {
      make.block(0.22,3.4,depth,wall,{x:x+s*(room.width/2-0.11),y,z,uv:3,solid:true});
      make.block(3.3,3.4,0.22,wall,{x:x+s*2.85,y,z:room.z0,uv:3,solid:true});
      make.block(0.08,2.7,0.32,wood,{x:x+s*1.24,y,z:room.z0-0.04,solid:true});
      make.block(0.035,0.65,depth-0.35,wood,{x:x+s*(room.width/2-0.235),y,z});
      make.block(0.07,0.04,depth-0.35,wood,{x:x+s*(room.width/2-0.25),y:y+0.65,z});
      // Shallow framed panels on the existing solid flank, clear of the doorway.
      make.quad(1.75,1.15,glass,{x:x+s*2.9,y:y+1.7,z:room.z0-0.122,ry:Math.PI});
      for (const dz of [-0.62,0.62]) make.block(1.9,0.07,0.13,wood,{x:x+s*2.9,y:y+1.7+dz,z:room.z0-0.16});
      for (const dx of [-0.92,0,0.92]) make.block(0.06,1.2,0.13,wood,{x:x+s*2.9+dx,y:y+1.1,z:room.z0-0.16});
      make.block(1.96,0.11,0.3,concrete,{x:x+s*2.9,y:y+1.04,z:room.z0-0.2});
      cylinder(0.045,3.15,x+s*(room.width/2+0.04),y,room.z0+0.15,metal,8);
    }
    make.block(2.4,0.7,0.22,wall,{x,y:y+2.7,z:room.z0,solid:true});
    make.block(room.width,3.4,0.22,wall,{x,y,z:room.z1,uv:3,solid:true});
    make.block(room.width-0.3,0.65,0.035,wood,{x,y,z:room.z1-0.13});
    make.block(room.width-0.3,0.05,0.08,wood,{x,y:y+0.65,z:room.z1-0.155});
    const menu=notice(room.kind==='tea'?['梯后茶单','老荫茶  6元','盖碗清茶  8元','续水免费','小坐 · 歇脚']:['山巷杂货','矿泉水  2元','暖饮  5元','雨具  12元','街坊便利']);
    make.block(2.0,1.85,0.06,wood,{x,y:y+1.05,z:room.z1-0.15});
    make.quad(1.88,1.72,menu,{x,y:y+1.98,z:room.z1-0.19,ry:Math.PI});
    for (const s of [-1,1]) make.block(0.09,3.2,0.08,wood,{x:x+s*4.15,y,z:room.z1-0.18});
    make.block(room.width+0.5,0.22,depth+0.7,concrete,{x,y:y+3.4,z,solid:true});
    make.block(room.width,0.08,1.15,metal,{x,y:y+2.95,z:room.z0-0.5});
    for (const yy of [y+3.15,y+3.48]) make.block(room.width+0.65,0.1,depth+0.8,metal,{x,y:yy,z});
    make.neonSign({text:room.name,pos:[x,y+3.32,room.z0-0.32],ry:Math.PI,size:0.42,color:room.kind==='tea'?NEON.amber:NEON.teal,light:false,halo:false});
    lamp(x,y+3.12,z,room.kind==='tea'?WINDOW.warm:WINDOW.fluor,7);
    lamp(x,y+2.7,room.z0-0.8,room.kind==='tea'?WINDOW.warm:WINDOW.fluor);
    if (room.kind==='tea') {
      for (const s of [-1,1]) for (const zz of [33.1,36.2]) {
        const tx=x+s*2.6;
        make.block(1.3,0.08,1.1,wood,{x:tx,y:y+0.72,z:zz});
        make.block(0.12,0.72,0.12,wood,{x:tx,y,z:zz});
        ctx.physics.addBox(tx-0.65,zz-0.55,tx+0.65,zz+0.55,y+0.8,y);
        for (const dz of [-0.9,0.9]) make.block(0.42,0.46,0.4,wood,{x:tx,y,z:zz+dz,solid:true});
        for (const dx of [-0.28,0.28]) {
          cylinder(0.065,0.12,tx+dx,y+0.8,zz,tile,10,0.073);
          cylinder(0.095,0.014,tx+dx,y+0.79,zz,tile,10);
          const handle=new THREE.Mesh(new THREE.TorusGeometry(0.034,0.012,4,8),tile);
          handle.position.set(tx+dx+0.081,y+0.862,zz);ctx.staticRoot.add(handle);
        }
      }
      make.block(2.8,1.0,0.55,wood,{x:x-2.6,y,z:37.5,solid:true});
    } else {
      for (const s of [-1,1]) {
        const sx=x+s*3.1;
        for (const zz of [33.2,35.8]) {
          make.block(0.07,2.0,1.8,metal,{x:sx-0.48,y,z:zz});
          make.block(0.07,2.0,1.8,metal,{x:sx+0.48,y,z:zz});
          ctx.physics.addBox(sx-0.52,zz-0.9,sx+0.52,zz+0.9,y+2,y);
          for (let shelf=0;shelf<4;shelf++) {
            make.block(1.02,0.04,1.8,wood,{x:sx,y:y+0.2+shelf*0.48,z:zz});
            for (let k=0;k<6;k++) make.block(0.25,0.3,0.26,goods[(k+shelf)%goods.length],
              {x:sx+(k%2-0.5)*0.45,y:y+0.24+shelf*0.48,z:zz+(Math.floor(k/2)-1)*0.48});
          }
        }
      }
      make.block(2.3,1.0,0.65,wood,{x:x+1.9,y,z:37.5,solid:true});
      make.block(0.35,0.25,0.3,metal,{x:x+1.9,y:y+1,z:37.5});
    }
  }
  ctx.provide('rainShelters', [...(ctx.use('rainShelters') || []), ...E.interiors.map(r =>
    ({ x0:r.x-r.width/2-0.25,x1:r.x+r.width/2+0.25,z0:r.z0-0.85,z1:r.z1+0.35,top:r.y+3.62 }))]);
  ctx.provide('exploration',{interiors:E.interiors,heightAt:L.walkHeightAt});
}
