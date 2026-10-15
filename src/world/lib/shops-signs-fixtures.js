// 楼体服务的 fixtures 以退进后的楼身立面为原点；店面/招牌挂在地块基座前沿。
export function fixtureBounds(facade, origin) {
  if (!facade?.fixtures) return [];
  const delta = facade.origin.clone().sub(origin);
  const du = delta.dot(facade.tangent), out = delta.dot(facade.normal);
  return facade.fixtures.map(f => ({ ...f, u0: f.u0 + du, u1: f.u1 + du, out: f.out + out }));
}

export function overlapsFixtures(front, u0, u1, y0, y1, out = 0, margin = 0.12) {
  return front.fixtures.some(f => f.out + margin >= out &&
    u0 < f.u1 + margin && u1 > f.u0 - margin && y0 < f.y1 + margin && y1 > f.y0 - margin);
}
