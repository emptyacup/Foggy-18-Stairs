// 确定性随机数：同一 seed 每次生成同样的世界。禁止在模块里用 Math.random()。
export function hashStr(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function makeRng(seed) {
  let a = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = () => next();
  r.range = (lo, hi) => lo + (hi - lo) * next();
  r.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * next());   // 含两端
  r.pick = arr => arr[Math.floor(next() * arr.length)];
  r.chance = p => next() < p;
  r.sign = () => (next() < 0.5 ? -1 : 1);
  r.weighted = pairs => {          // [[item, weight], ...]
    const tot = pairs.reduce((s, p) => s + p[1], 0);
    let x = next() * tot;
    for (const [it, w] of pairs) { if ((x -= w) <= 0) return it; }
    return pairs[pairs.length - 1][0];
  };
  return r;
}
