/**
 * The shape a road is drawn in. Armies and merchants find their way tile by
 * tile (marchRoute), and drawn as straight lines between its corners the road
 * looked ruled on: long straight runs, sharp elbows, a staircase on a slant.
 * Here the same road is drawn the way a track worn into the land runs: bends
 * swept wide, and long open stretches meandering gently. Wherever a swing
 * would leave ground the traveller can cross (a mountain, a lake, the coast),
 * the road pulls back towards its tiles (`open`).
 *
 * Only the drawing: the road's length and time (and so every march's
 * arrival) still come from the tiles. Deterministic: the same two places
 * always give the same road, and the road home is the road out, reversed.
 */

type Pt = { x: number; y: number };

/** The drawn road: its points (px) and, for each, where along the tile path it is (0..tiles-1). */
export type RoadShape = { points: Pt[]; u: number[] };

/** Whether the road may pass through `p` (px) at `u` along its tiles. */
export type Open = (p: Pt, u: number) => boolean;

/** Rounds the corners off: each pass cuts every corner a quarter of the way in (Chaikin). */
function chaikin(points: Pt[], u: number[], passes: number) {
  let p = points;
  let v = u;

  for (let n = 0; n < passes; n++) {
    const np: Pt[] = [p[0]];
    const nv = [v[0]];

    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i];
      const b = p[i + 1];

      np.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 }, { x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
      nv.push(v[i] * 0.75 + v[i + 1] * 0.25, v[i] * 0.25 + v[i + 1] * 0.75);
    }
    np.push(p[p.length - 1]);
    nv.push(v[v.length - 1]);
    p = np;
    v = nv;
  }

  return { points: p, u: v };
}

/** A number from 0 to 1 for a pair of places, the same whichever way round. */
const seedOf = (a: Pt, b: Pt) => {
  const s = Math.sin(a.x * 12.9898 + a.y * 78.233 + b.x * 37.719 + b.y * 4.581) * 43758.5453;

  return s - Math.floor(s);
};

const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

/** How far a drawn road may swing from its tiles, in tiles. */
const SWING = 0.85;

/**
 * `tiles`: the road's tiles as px points, start to end. `tile`: a tile's size
 * in px. `open`: where the road may go (everywhere when left out).
 */
export function roadShape(tiles: Pt[], tile: number, open: Open = () => true): RoadShape {
  const n = tiles.length;

  if (n < 2) return { points: tiles.slice(), u: tiles.map((_, i) => i) };
  // Worked out one way round (the same for out and home), then turned to fit.
  const a = tiles[0];
  const b = tiles[n - 1];
  const flip = a.x > b.x || (a.x === b.x && a.y > b.y);
  const src = flip ? tiles.slice().reverse() : tiles;
  const isOpen: Open = flip ? (p, u) => open(p, n - 1 - u) : open;

  // 1. Through the tiles, corners rounded: always on ground the road can take.
  const { points: base, u } = chaikin(src, src.map((_, i) => i), 3);
  const m = base.length;
  const s = [0];

  for (let i = 1; i < m; i++) s.push(s[i - 1] + Math.hypot(base[i].x - base[i - 1].x, base[i].y - base[i - 1].y));
  const length = s[m - 1];
  // Pinned to the villages at both ends, free after a tile and a half.
  const free = s.map((d) => smoothstep(Math.min(d, length - d) / (tile * 1.5)));

  // 2. Bends swept wide: each point drawn towards the average of the road
  //    around it (a tile and a bit either way).
  const sigma = tile * 1.2;
  let lo = 0;
  const swept = base.map((p, i) => {
    while (s[i] - s[lo] > sigma * 3) lo++;
    let wx = 0;
    let wy = 0;
    let w = 0;

    for (let j = lo; j < m && s[j] - s[i] <= sigma * 3; j++) {
      const k = Math.exp(-((s[j] - s[i]) ** 2) / (2 * sigma * sigma));

      wx += base[j].x * k;
      wy += base[j].y * k;
      w += k;
    }

    return { x: p.x + (wx / w - p.x) * free[i], y: p.y + (wy / w - p.y) * free[i] };
  });

  // 3. A gentle meander, sideways to the road: two slow waves of different
  //    lengths so it never looks regular; a short hop barely wanders.
  const seed = seedOf(src[0], src[n - 1]);
  const long = tile * (7 + seed * 3);
  const short = tile * (3 + seed * 1.5);
  const phase1 = seed * Math.PI * 2;
  const phase2 = seed * 17.3;
  const amp = tile * SWING * smoothstep(length / (tile * 6));
  const wanted = swept.map((p, i) => {
    if (i === 0 || i === m - 1) return p;
    const dx = swept[i + 1].x - swept[i - 1].x;
    const dy = swept[i + 1].y - swept[i - 1].y;
    const d = Math.hypot(dx, dy) || 1;
    const wave = 0.65 * Math.sin((s[i] / long) * Math.PI * 2 + phase1) + 0.35 * Math.sin((s[i] / short) * Math.PI * 2 + phase2);
    const off = amp * free[i] * wave;

    return { x: p.x - (dy / d) * off, y: p.y + (dx / d) * off };
  });

  // 4. Kept on open ground: how far each point may go from the tile road
  //    towards where it wants to be, checked all the way out...
  const STEPS = 8;
  const reach = wanted.map((w, i) => {
    const p = base[i];
    let k = 0;

    while (k < STEPS && isOpen({ x: p.x + ((w.x - p.x) * (k + 1)) / STEPS, y: p.y + ((w.y - p.y) * (k + 1)) / STEPS }, u[i])) k++;

    return k / STEPS;
  });
  // ...then eased along the road (the least nearby, softened), so it pulls
  // back gradually before an obstacle instead of kinking. Both steps only
  // ever lower a point's reach, so every point stays where it was checked.
  const span = tile;
  const near = (i: number, fn: (j: number) => void) => {
    for (let j = i; j >= 0 && s[i] - s[j] <= span; j--) fn(j);
    for (let j = i + 1; j < m && s[j] - s[i] <= span; j++) fn(j);
  };
  const least = reach.map((_, i) => {
    let v = 1;

    near(i, (j) => (v = Math.min(v, reach[j])));

    return v;
  });
  const eased = least.map((_, i) => {
    let sum = 0;
    let cnt = 0;

    near(i, (j) => {
      sum += least[j];
      cnt++;
    });

    return sum / cnt;
  });
  const out = base.map((p, i) => ({ x: p.x + (wanted[i].x - p.x) * eased[i], y: p.y + (wanted[i].y - p.y) * eased[i] }));

  return flip ? { points: out.reverse(), u: u.map((v) => n - 1 - v).reverse() } : { points: out, u };
}

/** Time through the trip (0..1) at `u` along the tile path, from each tile's time (`stops`). */
export const timeAt = (stops: number[], u: number) => {
  if (stops.length < 2) return stops[0] ?? 0;
  const k = Math.max(0, Math.min(stops.length - 2, Math.floor(u)));

  return stops[k] + (stops[k + 1] - stops[k]) * (u - k);
};
