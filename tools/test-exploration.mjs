// Integration paths use the same resolve/groundAt sequence and radius as Player.
import assert from 'node:assert/strict';
import { installDomStub } from './dom-stub.mjs';
installDomStub();
const THREE = await import('three');
const { createContext, QUALITY } = await import('../src/core/ctx.js');
const L = await import('../src/world/layout.js');
const { Player } = await import('../src/core/player.js');
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0, 0.01);
const ctx = createContext({ scene, camera: new THREE.PerspectiveCamera(), renderer: { capabilities: { getMaxAnisotropy: () => 8 } }, quality: QUALITY.high, audio: {} });
const pavement = [];
for (const name of L.MODULES) {
  if (['weather', 'characters'].includes(name)) continue;
  if (name === 'exploration') { try { await import('../src/world/exploration.js'); } catch { continue; } }
  const before = new Set(ctx.staticRoot.children);
  ctx._module = name;
  await (await import(`../src/world/${name}.js`)).build(ctx);
  if (['terrain', 'exploration', 'districts'].includes(name)) pavement.push(...ctx.staticRoot.children.filter(o => !before.has(o)));
}
ctx.staticRoot.traverse(o => { if (o.userData?.walkable) pavement.push(o); });   // 可进入店铺的地面（rooms.js）
scene.updateMatrixWorld(true);
const ray = new THREE.Raycaster();

function walk(name, points, initialY = 40) {
  const p = new THREE.Vector3(points[0][0], 40, points[0][1]);
  p.y = ctx.physics.groundAt(p.x, p.z, initialY);
  for (const [x, z] of points.slice(1)) {
    const start = p.clone(), length = Math.hypot(x - start.x, z - start.z);
    const n = Math.ceil(length / 0.08);
    for (let i = 1; i <= n; i++) {
      const tx = start.x + (x - start.x) * i / n, tz = start.z + (z - start.z) * i / n;
      const previous = p.y;
      p.x = tx; p.z = tz;
      ctx.physics.resolve(p, 0.35, p.y);
      assert.ok(Math.hypot(p.x - tx, p.z - tz) < 0.025, `${name}: collision blocks (${tx.toFixed(2)},${tz.toFixed(2)}) at y=${previous.toFixed(2)}`);
      p.y = ctx.physics.groundAt(p.x, p.z, p.y);
      assert.ok(Math.abs(p.y - previous) < 0.46, `${name}: unsupported height jump ${previous.toFixed(2)} → ${p.y.toFixed(2)} at (${tx.toFixed(2)},${tz.toFixed(2)})`);
      if (i % 12 === 0 || i === n) {
        ray.set(new THREE.Vector3(p.x,p.y+0.46,p.z),new THREE.Vector3(0,-1,0));
        ray.far = 0.92;
        assert.ok(ray.intersectObjects(pavement,true).length > 0, `${name}: no physical paving beneath (${p.x.toFixed(2)},${p.z.toFixed(2)}) y=${p.y.toFixed(2)}`);
      }
    }
  }
  console.log(`PASS ${name}: ends (${p.x},${p.y.toFixed(2)},${p.z})`);
  return p;
}
const hero = [0.5, -6.5];
const failures = [];
for (const [name, points] of [
  ['west lane', [hero, [0,0], [-31.5,0], [-31.5,-108], [-20,-108]]],
  ['east lane', [hero, [0,0], [31.5,0], [31.5,-108], [20,-108]]],
  ['tea interior', [hero, [0,0], [0,28], [-16,28], [-16,34]]],
  ['store interior', [hero, [0,0], [0,28], [16,28], [16,34]]],
  ['riverwalk', [hero, [0,-108], [-57,-108], [-57,-118], [-56,-118], [-31,-118], [-31,-128], [-30,-128], [-30,-147], [0,-147]]],
  // v4 扩展区（districts）
  ...[-1, 1].map(s => [`hill loop ${s < 0 ? 'W' : 'E'}`, [hero, [0,0], [s*31.5,0], [s*31.5,-32], [s*104,-32], [s*104,-58], [s*31.5,-58], [s*31.5,-84], [s*104,-84], [s*104,-60]]]),
  ['south district', [hero, [0,0], [0,28], [0,44], [3,55], [3,66], [50,66], [3,66], [3,79], [0,81], [0,96], [-30,96], [30,96]]],
  ['river arcade W', [hero, [0,-108], [-57,-108], [-57,-118], [-56,-118], [-31,-118], [-31,-128], [-30,-128], [-30,-129.3], [-36,-129.3], [-36,-127.3], [-70,-127.3], [-190,-127.3]]],
  // 可进入的店铺
  ['stair shop E2', [hero, [0.5,-24.2], [8,-24.2], [11.0,-24.2]]],
  ['stair shop W3', [hero, [0.5,-24.2], [0.5,-55.0], [-8,-55.0], [-11.0,-55.0]]],
  ['back street shop', [hero, [0,0], [0,28], [0,38.8], [-8.06,38.8], [-8.06,43.5]]],
  ['ferry pontoon', [hero, [0,-108], [-57,-108], [-57,-118], [-56,-118], [-31,-118], [-31,-128], [-30,-128], [-30,-147.5], [-105,-147.5], [-105,-158.5], [-95,-159], [-95,-166], [-116,-166], [-116,-158.6], [-107,-158.6], [-107,-163.6]]],
]) {
  try {
    const end = walk(name, points);
    walk(name+' return',points.toReversed(),end.y);
  } catch (error) { failures.push(error.message); }
}
assert.deepEqual(failures, [], failures.join('\n'));
assert.ok(L.MODULES.includes('exploration'), 'enterable rooms must be built in the running scene');
assert.equal(ctx.use('exploration')?.interiors.length, 2, 'two real interiors');
// The river barrier and existing building bases must remain solid.
for (const [x,z,y] of [[0,-122,10], [0,-150,0.15], [-20,-30,30], [20,-30,30], [-16,38.2,40],
  [-31.5-1.3,-50,L.stairRampAt(-50)], [31.5+1.3,-50,L.stairRampAt(-50)], [-40,-115,10], [-26,-118,0],
  [-19,31,40],[19,31,40],[-20.45,34,40],[20.45,34,40]]) {
  const p = new THREE.Vector3(x,y,z);
  ctx.physics.resolve(p,0.35,y);
  assert.ok(Math.hypot(p.x-x,p.z-z)>0.1, `missing perimeter collision at ${x},${z}`);
}
assert.equal(ctx.physics.groundAt(-32,-124,0), 0, 'wall doorway has ground at road level');
assert.equal(ctx.physics.groundAt(-16,34,40), 40, 'interior floor');
// 主阶梯分道扶手有碰撞：梯段中途不能横穿
{
  const z = -15, y = L.stairHeightAt(z), p = new THREE.Vector3(2.9, y, z);
  for (let i = 0; i < 20; i++) { p.x += 0.05; ctx.physics.resolve(p, 0.35, y); }
  assert.ok(p.x < 3.4 - 0.3, `stair handrail must block crossing mid-flight (x=${p.x.toFixed(2)})`);
}
const player = new Player(ctx.camera, null, ctx.physics, { enabled: false });
player.place(-44, 6.65, -116.65, Math.PI, 0);
player.fly = false; player.enabled = true;
player.keys.add('KeyW'); player.keys.add('ShiftLeft');
player.update(0.1);
assert.ok(player.pos.z < -116.5 && player.pos.y > 4.5, '最大帧步长冲刺不能穿过下行梯护栏并跌入沟槽');
console.log('RESULT: OK');

