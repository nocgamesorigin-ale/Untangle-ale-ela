// Level data + a seeded generator that guarantees every level is solvable.
//
// A level is a board of pegs (lattice points inside a shape) with rubber bands
// stretched over them in layers. A band can be taken only when no band above
// it crosses it. Taken bands fly to a colour tray (3 per tray) or, if no tray
// of that colour is showing, park in the holder. Holder full = out of space.
//
// Every level is built from its own seed, then checked by a greedy solver with
// the level's holder size; layouts that fail (or are too easy for a hard level)
// are thrown away and the next seed is tried. Same level → same layout, always.

export type Lattice = 'tri' | 'sq';
export type Difficulty = 'normal' | 'hard' | 'superhard';
export type ShapeName =
  | 'diamond' | 'triangle' | 'invTriangle' | 'hexagon' | 'octagon' | 'square' | 'circle'
  | 'heart' | 'star' | 'cross' | 'hourglass' | 'crown' | 'shield' | 'butterfly' | 'ring' | 'trapezoid'
  | 'flower' | 'drop' | 'dumbbell' | 'arch' | 'cloud';

/**
 * How pegs are laid out inside the board: the full lattice, or a lattice with a
 * designed gap pattern (so bands hook in more varied places).
 */
export type Pattern = 'full' | 'honeycomb' | 'rows' | 'holes' | 'sparse' | 'moat';

export interface LevelSpec {
  name: string;
  shape: ShapeName;
  /** Board radius in lattice units. */
  size: number;
  lattice: Lattice;
  bands: number;
  colors: number;
  /** Colour trays visible at the same time. */
  trays: 1 | 2;
  /** Open holder slots at the start (one more locked slot is shown). */
  holder: number;
  diff: Difficulty;
  tpl: string[];
  /** 0..1 — how eager bands are to pile onto each other. */
  overlap: number;
  /** Peg layout inside the shape (default: full lattice). */
  pattern?: Pattern;
}

export const COLORS = [
  { name: 'red', base: '#F34876', dark: '#b81a4a', light: '#ffa3bd' },
  { name: 'cyan', base: '#35d6e6', dark: '#16889a', light: '#9ff0f7' },
  { name: 'yellow', base: '#ffc531', dark: '#c4870a', light: '#ffe596' },
  { name: 'purple', base: '#7549C8', dark: '#45228a', light: '#c4a8f5' },
  { name: 'green', base: '#20CDA0', dark: '#0d8a6a', light: '#9af0d6' },
  { name: 'blue', base: '#2689ED', dark: '#1352ad', light: '#9ccbff' },
  { name: 'orange', base: '#ff8a3d', dark: '#bf5512', light: '#ffc49b' },
  { name: 'pink', base: '#ff6fc0', dark: '#bd2f84', light: '#ffb9e0' },
];

export const SPECS: LevelSpec[] = [
  // Triangle (1–3)
  { name: 'First Knot', shape: 'triangle', size: 3.48, lattice: 'tri', bands: 6, colors: 2, trays: 2, holder: 4, diff: 'normal', tpl: ['seg', 'tri', 'seg2'], overlap: 0.55 },
  { name: 'Pyramid', shape: 'triangle', size: 3.78, lattice: 'tri', bands: 9, colors: 3, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'seg', 'seg2'], overlap: 0.6 },
  { name: 'Honeycomb', shape: 'triangle', size: 3.8, lattice: 'tri', bands: 9, colors: 3, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'hex', 'seg2', 'rhomb', 'seg'], overlap: 0.65, pattern: 'honeycomb' },
  // Square (4–5)
  { name: 'Checkerboard', shape: 'square', size: 2.45, lattice: 'sq', bands: 12, colors: 3, trays: 2, holder: 4, diff: 'normal', tpl: ['sq', 'seg', 'tri', 'seg2', 'diag'], overlap: 0.7 },
  { name: 'Courtyard', shape: 'square', size: 4.22, lattice: 'sq', bands: 12, colors: 4, trays: 2, holder: 4, diff: 'normal', tpl: ['sq', 'rect', 'diam', 'tri', 'seg2'], overlap: 0.72 },
  // Heart (6–8)
  { name: 'Heartstrings', shape: 'heart', size: 3.59, lattice: 'tri', bands: 15, colors: 4, trays: 2, holder: 4, diff: 'hard', tpl: ['tri', 'rhomb', 'seg2', 'trap', 'hex'], overlap: 0.82 },
  { name: 'Sweetheart', shape: 'heart', size: 4.67, lattice: 'tri', bands: 15, colors: 4, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'rhomb', 'seg2', 'trap'], overlap: 0.75 },
  { name: 'Love Lines', shape: 'heart', size: 3.57, lattice: 'tri', bands: 18, colors: 5, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'tri2', 'seg2', 'rhomb', 'seg'], overlap: 0.78 },
  // Hexagon (9–11)
  { name: 'Hive', shape: 'hexagon', size: 3.7, lattice: 'tri', bands: 18, colors: 5, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'seg2', 'rhomb', 'trap', 'hex'], overlap: 0.8 },
  { name: 'Royal Hive', shape: 'hexagon', size: 5.46, lattice: 'tri', bands: 24, colors: 5, trays: 2, holder: 3, diff: 'superhard', tpl: ['hex', 'tri', 'tri2', 'trap', 'rhomb2', 'seg2'], overlap: 0.9, pattern: 'honeycomb' },
  { name: 'Hollow Hive', shape: 'hexagon', size: 4.54, lattice: 'tri', bands: 18, colors: 5, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'seg2', 'seg3', 'rhomb', 'trap'], overlap: 0.78 },
  // Cloud (12–14)
  { name: 'Cloud Nine', shape: 'cloud', size: 4.3, lattice: 'tri', bands: 21, colors: 5, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'trap', 'rhomb2', 'seg3', 'hex'], overlap: 0.8 },
  { name: 'Storm Cloud', shape: 'cloud', size: 5.77, lattice: 'tri', bands: 24, colors: 6, trays: 2, holder: 4, diff: 'hard', tpl: ['tri', 'hex', 'rhomb', 'seg2', 'trap'], overlap: 0.86, pattern: 'honeycomb' },
  { name: 'Silver Lining', shape: 'cloud', size: 4.77, lattice: 'tri', bands: 21, colors: 6, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'rhomb', 'seg2', 'trap'], overlap: 0.8 },
  // Trapezoid (15–17)
  { name: 'Grand Stairs', shape: 'trapezoid', size: 5.34, lattice: 'tri', bands: 27, colors: 6, trays: 2, holder: 4, diff: 'superhard', tpl: ['tri', 'tri2', 'trap', 'rhomb2', 'pent', 'seg2'], overlap: 0.9 },
  { name: 'Terraces', shape: 'trapezoid', size: 4.73, lattice: 'tri', bands: 24, colors: 6, trays: 2, holder: 4, diff: 'hard', tpl: ['tri', 'rhomb2', 'seg3', 'trap', 'hex', 'seg2'], overlap: 0.86 },
  { name: 'Golden Steps', shape: 'trapezoid', size: 4.88, lattice: 'tri', bands: 27, colors: 3, trays: 2, holder: 4, diff: 'normal', tpl: ['tri', 'tri2', 'hex', 'trap', 'rhomb'], overlap: 0.82 },
  // Star (18–20)
  { name: 'Shooting Star', shape: 'star', size: 6.51, lattice: 'tri', bands: 27, colors: 7, trays: 2, holder: 4, diff: 'hard', tpl: ['tri', 'rhomb2', 'seg3', 'trap', 'hex', 'seg2'], overlap: 0.88 },
  { name: 'Stardust', shape: 'star', size: 7.26, lattice: 'tri', bands: 30, colors: 7, trays: 2, holder: 4, diff: 'hard', tpl: ['tri', 'rhomb', 'trap', 'seg2', 'hex'], overlap: 0.86 },
  { name: 'Grand Finale', shape: 'star', size: 7.82, lattice: 'tri', bands: 33, colors: 8, trays: 2, holder: 4, diff: 'superhard', tpl: ['hex', 'tri2', 'trap', 'pent', 'rhomb2', 'tri'], overlap: 0.92 },
];

// ---- geometry ----------------------------------------------------------------

/** Radius of the band's wrap around a peg, in lattice units. */
export const WRAP = 0.22;
/** Two band outlines closer than this cross each other. */
const CROSS = 0.17;

export interface Band {
  id: number;
  color: number;
  pegs: number[];
  /** Closed outline (x0,y0,x1,y1,…) in world units. */
  outline: Float32Array;
  /** Convex hull of the peg centres. */
  hull: Float32Array;
  cx: number;
  cy: number;
  minX: number; minY: number; maxX: number; maxY: number;
  /** Bands above this one that cross it (by id). */
  above: number[];
  /** Bands below this one that it crosses. */
  below: number[];
}

export interface Level {
  spec: LevelSpec;
  index: number;
  pegX: Float32Array;
  pegY: Float32Array;
  /** Board grid line segments (x1, y1, x2, y2, …) in world units. */
  grid: Float32Array;
  /** Shape polygon in world units (outer), and an optional hole. */
  poly: Float32Array;
  hole: Float32Array | null;
  bands: Band[];
  queue: number[];
  holder: number;
  /** Fewest holder slots the solver needed. */
  peak: number;
  /** Padlocked band and the band carrying its key (the key must be collected first). */
  lock: { band: number; key: number } | null;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function regular(n: number, start: number, sy = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = start + (i / n) * Math.PI * 2;
    out.push(Math.cos(a), Math.sin(a) * sy);
  }
  return out;
}

function starPoly(points: number, inner: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : inner;
    out.push(Math.cos(a) * r, Math.sin(a) * r);
  }
  return out;
}

function heartPoly(): number[] {
  const out: number[] = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    out.push(x / 16.5, (y + 2.5) / 15.5);
  }
  return out;
}

/** Normalised shape polygons (y down, about [-1,1]). */
export function shapePoly(shape: ShapeName): { poly: number[]; hole: number[] | null } {
  switch (shape) {
    case 'diamond': return { poly: [0, -1, 0.74, 0, 0, 1, -0.74, 0], hole: null };
    case 'triangle': return { poly: [0, -1, 1.05, 0.8, -1.05, 0.8], hole: null };
    case 'invTriangle': return { poly: [-1.05, -0.8, 1.05, -0.8, 0, 1], hole: null };
    case 'hexagon': return { poly: regular(6, 0, 1), hole: null };
    case 'octagon': return { poly: regular(8, Math.PI / 8, 1.08), hole: null };
    case 'square': return { poly: [-1, -1, 1, -1, 1, 1, -1, 1], hole: null };
    case 'circle': return { poly: regular(40, 0, 1), hole: null };
    case 'heart': return { poly: heartPoly(), hole: null };
    case 'star': return { poly: starPoly(5, 0.56), hole: null };
    case 'cross': {
      const a = 0.38;
      return { poly: [-a, -1, a, -1, a, -a, 1, -a, 1, a, a, a, a, 1, -a, 1, -a, a, -1, a, -1, -a, -a, -a], hole: null };
    }
    case 'hourglass': return { poly: [-0.95, -1, 0.95, -1, 0.3, 0, 0.95, 1, -0.95, 1, -0.3, 0], hole: null };
    case 'crown': return { poly: [-1, 0.85, 1, 0.85, 1, -0.75, 0.5, -0.15, 0, -1, -0.5, -0.15, -1, -0.75], hole: null };
    case 'shield': return { poly: [-0.95, -1, 0.95, -1, 0.95, 0.15, 0, 1, -0.95, 0.15], hole: null };
    case 'butterfly': return { poly: [-1, -0.9, 0, -0.3, 1, -0.9, 0.78, 0, 1, 0.9, 0, 0.3, -1, 0.9, -0.78, 0], hole: null };
    case 'flower': {
      const o: number[] = [];
      for (let i = 0; i < 70; i++) {
        const a = -Math.PI / 2 + (i / 70) * Math.PI * 2;
        const r = 0.76 + 0.24 * Math.cos(5 * (a + Math.PI / 2));
        o.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      return { poly: o, hole: null };
    }
    case 'drop': {
      // teardrop, point up: a circle plus the two tangents to the tip
      const o: number[] = [0, -1];
      const cy = 0.32, r = 0.66;
      const al = Math.asin(r / (1 + cy));
      const a0 = -Math.PI / 2 + (Math.PI / 2 - al), a1 = -Math.PI / 2 - (Math.PI / 2 - al) + Math.PI * 2;
      for (let i = 0; i <= 40; i++) {
        const a = a0 + ((a1 - a0) * i) / 40;
        o.push(Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      return { poly: o, hole: null };
    }
    case 'dumbbell': {
      // two round ends joined by a bar
      const o: number[] = [];
      const c = 0.52, r = 0.5, h = 0.26;
      const dx = Math.sqrt(r * r - h * h);
      const aR = Math.atan2(-h, -dx);
      for (let i = 0; i <= 30; i++) { const a = aR + ((Math.PI * 2 - 2 * (Math.PI + aR)) * i) / 30; o.push(c + Math.cos(a) * r, Math.sin(a) * r); }
      const aL = Math.atan2(h, dx);
      for (let i = 0; i <= 30; i++) { const a = aL + ((Math.PI * 2 - 2 * aL) * i) / 30; o.push(-c + Math.cos(a) * r, Math.sin(a) * r); }
      return { poly: o.map((v, k) => (k % 2 ? v * 1.25 : v)), hole: null };
    }
    case 'arch': {
      // a rainbow: outer half-disc minus an inner half-disc
      const o: number[] = [];
      const cy = 0.5, R1 = 1, R0 = 0.42;
      for (let i = 0; i <= 30; i++) { const a = Math.PI + (Math.PI * i) / 30; o.push(Math.cos(a) * R1, cy + Math.sin(a) * R1 * 1.1); }
      for (let i = 0; i <= 20; i++) { const a = Math.PI * 2 - (Math.PI * i) / 20; o.push(Math.cos(a) * R0, cy + Math.sin(a) * R0 * 1.1); }
      return { poly: o, hole: null };
    }
    case 'cloud': {
      const o: number[] = [];
      for (let i = 0; i < 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = 0.8 + 0.14 * Math.abs(Math.cos(3.5 * a));
        o.push(Math.cos(a) * r * 1.12, Math.sin(a) * r * 0.86);
      }
      return { poly: o, hole: null };
    }
    case 'trapezoid': return { poly: [-0.4, -1, 0.4, -1, 1.06, 0.85, -1.06, 0.85], hole: null };
    case 'ring': return { poly: regular(40, 0, 1), hole: regular(28, 0, 1).map((v) => v * 0.36) };
  }
}

export function pointInPoly(px: number, py: number, p: ArrayLike<number>): boolean {
  let inside = false;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = p[i * 2], yi = p[i * 2 + 1], xj = p[j * 2], yj = p[j * 2 + 1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distToPolyEdge(px: number, py: number, p: ArrayLike<number>): number {
  let best = Infinity;
  const n = p.length / 2;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    best = Math.min(best, segDist(px, py, p[j * 2], p[j * 2 + 1], p[i * 2], p[i * 2 + 1]));
  }
  return best;
}

export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const qx = ax + t * dx - px, qy = ay + t * dy - py;
  return Math.sqrt(qx * qx + qy * qy);
}

function segSegDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  // Proper crossing → 0.
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  return Math.min(segDist(ax, ay, cx, cy, dx, dy), segDist(bx, by, cx, cy, dx, dy), segDist(cx, cy, ax, ay, bx, by), segDist(dx, dy, ax, ay, bx, by));
}

function hullOf(xs: number[], ys: number[]): number[] {
  const idx = xs.map((_, i) => i).sort((a, b) => xs[a] - xs[b] || ys[a] - ys[b]);
  const cross = (o: number, a: number, b: number) => (xs[a] - xs[o]) * (ys[b] - ys[o]) - (ys[a] - ys[o]) * (xs[b] - xs[o]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 1e-9) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 1e-9) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Rounded outline around a convex hull (Minkowski sum with a disc). */
export function outlineOf(hx: number[], hy: number[], r: number, arcStep: number): number[] {
  const n = hx.length;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i - 1 + n) % n, q = (i + 1) % n;
    let d1x = hx[i] - hx[p], d1y = hy[i] - hy[p];
    let d2x = hx[q] - hx[i], d2y = hy[q] - hy[i];
    const l1 = Math.hypot(d1x, d1y) || 1, l2 = Math.hypot(d2x, d2y) || 1;
    d1x /= l1; d1y /= l1; d2x /= l2; d2y /= l2;
    const n2x = d2y, n2y = -d2x;
    const n1x = d1y, n1y = -d1x;
    let turn = Math.atan2(n1x * n2y - n1y * n2x, n1x * n2x + n1y * n2y);
    if (turn < 0) turn += Math.PI * 2;
    const start = Math.atan2(n1y, n1x);
    const steps = Math.max(1, Math.ceil(turn / arcStep));
    for (let s = 0; s <= steps; s++) {
      const a = start + (turn * s) / steps;
      out.push(hx[i] + Math.cos(a) * r, hy[i] + Math.sin(a) * r);
    }
  }
  return out;
}

function makeBand(id: number, pegs: number[], px: Float32Array, py: Float32Array, arcStep: number): Band {
  const xs = pegs.map((i) => px[i]);
  const ys = pegs.map((i) => py[i]);
  const h = hullOf(xs, ys);
  const hx = h.map((i) => xs[i]);
  const hy = h.map((i) => ys[i]);
  const o = outlineOf(hx, hy, WRAP, arcStep);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, cx = 0, cy = 0;
  for (let i = 0; i < o.length; i += 2) {
    minX = Math.min(minX, o[i]); maxX = Math.max(maxX, o[i]);
    minY = Math.min(minY, o[i + 1]); maxY = Math.max(maxY, o[i + 1]);
  }
  for (let i = 0; i < hx.length; i++) { cx += hx[i]; cy += hy[i]; }
  const hull: number[] = [];
  for (let i = 0; i < hx.length; i++) hull.push(hx[i], hy[i]);
  return {
    id, color: 0, pegs: h.map((i) => pegs[i]), outline: new Float32Array(o), hull: new Float32Array(hull),
    cx: cx / hx.length, cy: cy / hx.length, minX, minY, maxX, maxY, above: [], below: [],
  };
}

function crosses(a: Band, b: Band): boolean {
  if (a.maxX + CROSS < b.minX || b.maxX + CROSS < a.minX || a.maxY + CROSS < b.minY || b.maxY + CROSS < a.minY) return false;
  const A = a.outline, B = b.outline;
  const na = A.length / 2, nb = B.length / 2;
  for (let i = 0; i < na; i++) {
    const i2 = ((i + 1) % na) * 2;
    for (let j = 0; j < nb; j++) {
      const j2 = ((j + 1) % nb) * 2;
      if (segSegDist(A[i * 2], A[i * 2 + 1], A[i2], A[i2 + 1], B[j * 2], B[j * 2 + 1], B[j2], B[j2 + 1]) < CROSS) return true;
    }
  }
  return false;
}

// ---- templates ----------------------------------------------------------------

const TRI_TPL: Record<string, number[][]> = {
  seg: [[0, 0], [1, 0]],
  seg2: [[0, 0], [2, 0]],
  seg3: [[0, 0], [3, 0]],
  diag: [[0, 0], [1, 1]],
  tri: [[0, 0], [1, 0], [0, 1]],
  tri2: [[0, 0], [2, 0], [0, 2]],
  rhomb: [[0, 0], [1, 0], [1, 1], [0, 1]],
  rhomb2: [[0, 0], [2, 0], [2, 1], [0, 1]],
  trap: [[0, 0], [2, 0], [1, 1], [0, 1]],
  hex: [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]],
  pent: [[0, 0], [2, 0], [2, 1], [1, 2], [0, 1]],
  sq: [[0, 0], [1, 0], [1, 1], [0, 1]],
  rect: [[0, 0], [2, 0], [2, 1], [0, 1]],
  diam: [[0, 0], [1, 0], [1, 1], [0, 1]],
  sq2: [[0, 0], [2, 0], [2, 2], [0, 2]],
};

const SQ_TPL: Record<string, number[][]> = {
  seg: [[0, 0], [1, 0]],
  seg2: [[0, 0], [2, 0]],
  seg3: [[0, 0], [3, 0]],
  diag: [[0, 0], [1, 1]],
  tri: [[0, 0], [1, 0], [0, 1]],
  tri2: [[0, 0], [2, 0], [0, 2]],
  sq: [[0, 0], [1, 0], [1, 1], [0, 1]],
  rect: [[0, 0], [2, 0], [2, 1], [0, 1]],
  diam: [[1, 0], [0, 1], [-1, 0], [0, -1]],
  sq2: [[0, 0], [2, 0], [2, 2], [0, 2]],
  hex: [[1, 0], [2, 1], [1, 2], [0, 2], [-1, 1], [0, 0]],
  trap: [[0, 0], [3, 0], [2, 1], [1, 1]],
  pent: [[0, 0], [2, 0], [2, 1], [1, 2], [0, 1]],
  rhomb: [[0, 0], [1, 0], [2, 1], [1, 1]],
  rhomb2: [[0, 0], [2, 0], [3, 1], [1, 1]],
};

// ---- solver -------------------------------------------------------------------

export interface PlayState {
  removed: Uint8Array;
  trays: { color: number; count: number }[];
  /** Next queue index to show. */
  qi: number;
  holder: number[];
}

export function isFree(bands: Band[], removed: Uint8Array, id: number): boolean {
  if (removed[id]) return false;
  for (const a of bands[id].above) if (!removed[a]) return false;
  return true;
}

/** How many bands become free if `id` goes. */
export function freesCount(bands: Band[], removed: Uint8Array, id: number): number {
  let n = 0;
  for (const b of bands[id].below) {
    if (removed[b]) continue;
    let only = true;
    for (const a of bands[b].above) if (a !== id && !removed[a]) { only = false; break; }
    if (only) n++;
  }
  return n;
}

export function trayFor(state: PlayState, color: number): number {
  for (let i = 0; i < state.trays.length; i++) {
    const t = state.trays[i];
    if (t.color === color && t.count < 3) return i;
  }
  return -1;
}

function nextTrayDistance(queue: number[], state: PlayState, color: number): number {
  for (let i = state.qi; i < queue.length; i++) if (queue[i] === color) return i - state.qi;
  return 999;
}

/** Best move by a simple greedy rule; also used by the Hint booster. */
export function chooseMove(bands: Band[], queue: number[], state: PlayState, cap: number, rand?: () => number): { id: number; direct: boolean } | null {
  let best = -1, bestScore = -Infinity, bestDirect = false;
  for (let id = 0; id < bands.length; id++) {
    if (!isFree(bands, state.removed, id)) continue;
    const direct = trayFor(state, bands[id].color) >= 0;
    let score: number;
    if (direct) score = 1000 + freesCount(bands, state.removed, id) * 3;
    else {
      if (state.holder.length >= cap) continue;
      score = -nextTrayDistance(queue, state, bands[id].color) * 10 + freesCount(bands, state.removed, id) * 4;
    }
    if (rand) score += rand() * 6;
    if (score > bestScore) { bestScore = score; best = id; bestDirect = direct; }
  }
  return best < 0 ? null : { id: best, direct: bestDirect };
}

/** Applies a move; returns whether a tray filled. Mirrors the game rules. */
export function applyMove(bands: Band[], queue: number[], state: PlayState, id: number): void {
  state.removed[id] = 1;
  const c = bands[id].color;
  const t = trayFor(state, c);
  if (t >= 0) {
    state.trays[t].count++;
    settleTrays(queue, state);
  } else state.holder.push(c);
}

export function settleTrays(queue: number[], state: PlayState): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of state.trays) {
      if (t.color >= 0 && t.count >= 3) {
        if (state.qi < queue.length) { t.color = queue[state.qi++]; t.count = 0; } else { t.color = -1; t.count = 0; }
        changed = true;
      }
    }
    for (let h = 0; h < state.holder.length; h++) {
      const ti = trayFor(state, state.holder[h]);
      if (ti >= 0) {
        state.trays[ti].count++;
        state.holder.splice(h, 1);
        h--;
        changed = true;
      }
    }
  }
}

export function initialState(n: number, queue: number[], trays: number): PlayState {
  const s: PlayState = { removed: new Uint8Array(n), trays: [], qi: 0, holder: [] };
  for (let i = 0; i < trays; i++) {
    if (s.qi < queue.length) s.trays.push({ color: queue[s.qi++], count: 0 });
    else s.trays.push({ color: -1, count: 0 });
  }
  return s;
}

function solve(bands: Band[], queue: number[], trays: number, cap: number, rand?: () => number, order?: number[]): number {
  const s = initialState(bands.length, queue, trays);
  let peak = 0;
  for (let step = 0; step < bands.length; step++) {
    const m = chooseMove(bands, queue, s, cap, rand);
    if (!m) return Infinity;
    applyMove(bands, queue, s, m.id);
    order?.push(m.id);
    peak = Math.max(peak, s.holder.length);
  }
  return s.holder.length === 0 ? peak : Infinity;
}

/**
 * Adds a padlock + key from level 5 on. The pair is chosen from a winning line
 * the solver found (key collected well before the locked band), so making the
 * locked band wait for its key cannot make the level unsolvable.
 */
function addLock(index: number, bands: Band[], queue: number[], trays: number, cap: number): Level['lock'] {
  if (index < 5) return null;
  let order: number[] | null = null;
  const r = mulberry(index * 131 + 7);
  for (let i = 0; i < 12 && !order; i++) {
    const o: number[] = [];
    if (isFinite(solve(bands, queue, trays, cap, i === 0 ? undefined : r, o))) order = o;
  }
  if (!order) return null;
  const n = order.length;
  // Lock: a late band toward the lower-left. Key: an earlier band toward the right.
  let lock = -1, best = -Infinity;
  for (let k = Math.floor(n * 0.55); k < n; k++) {
    const b = bands[order[k]];
    const score = b.cy - b.cx * 0.8;
    if (score > best) { best = score; lock = k; }
  }
  if (lock < 0) return null;
  let key = -1;
  best = -Infinity;
  for (let k = Math.floor(lock * 0.15); k < lock - 1; k++) {
    const b = bands[order[k]];
    if (bands[order[lock]].above.includes(b.id)) continue;
    const score = b.cx - Math.abs(b.cy - bands[order[lock]].cy) * 0.2;
    if (score > best) { best = score; key = k; }
  }
  if (key < 0) return null;
  const L = bands[order[lock]], K = bands[order[key]];
  L.above.push(K.id);
  K.below.push(L.id);
  return { band: L.id, key: K.id };
}

function bestPeak(bands: Band[], queue: number[], trays: number, cap: number, seed: number): number {
  let best = solve(bands, queue, trays, cap);
  const r = mulberry(seed);
  for (let i = 0; i < 10 && best > 0; i++) best = Math.min(best, solve(bands, queue, trays, cap, r));
  return best;
}

// ---- generation ---------------------------------------------------------------

/** Shapes whose board outline is fitted to the peg layout. */
const CONVEX = new Set<ShapeName>(['triangle', 'invTriangle', 'square', 'hexagon', 'octagon', 'trapezoid', 'diamond', 'circle']);
/** Margin from the outer peg centres to the board outline (world units). */
const HUG = 0.4;

function buildBoard(spec: LevelSpec, seed: number) {
  const { poly: np, hole: nh } = shapePoly(spec.shape);
  const R = spec.size;
  const poly = np.map((v) => v * R);
  const hole = nh ? nh.map((v) => v * R) : null;
  const xs: number[] = [], ys: number[] = [], keys = new Map<string, number>();
  const edge: number[] = [];
  const all = new Map<string, [number, number]>();
  const H = 0.8660254;
  const lim = Math.ceil(R * 1.4) + 2;
  const rand = mulberry(seed);
  // pattern parameters (seeded, so the layout is the same every time)
  const pattern = spec.pattern ?? 'full';
  const holes: [number, number][] = [];
  if (pattern === 'holes') {
    for (let i = 0; i < 3; i++) holes.push([(rand() - 0.5) * R * 1.1, (rand() - 0.5) * R * 1.1]);
  }
  const keep = (q: number, r: number, x: number, y: number): boolean => {
    switch (pattern) {
      case 'honeycomb': return spec.lattice !== 'tri' || ((q - r) % 3 + 3) % 3 !== 0;
      case 'rows': return ((r % 3) + 3) % 3 !== 1;
      case 'holes': return holes.every(([hx, hy]) => Math.hypot(x - hx, y - hy) > 1.05);
      case 'sparse': return rand() > 0.2;
      case 'moat': { const d = Math.hypot(x, y) / R; return d < 0.3 || d > 0.58; }
      default: return true;
    }
  };
  for (let r = -lim * 2; r <= lim * 2; r++) {
    for (let q = -lim * 2; q <= lim * 2; q++) {
      const x = spec.lattice === 'tri' ? q + r * 0.5 : q;
      const y = spec.lattice === 'tri' ? r * H : r;
      if (Math.abs(x) > R * 1.3 || Math.abs(y) > R * 1.3) continue;
      if (!pointInPoly(x, y, poly)) continue;
      if (distToPolyEdge(x, y, poly) < 0.28) continue;
      if (hole && (pointInPoly(x, y, hole) || distToPolyEdge(x, y, hole) < 0.45)) continue;
      all.set(q + ',' + r, [x, y]);
      if (!keep(q, r, x, y)) continue;
      keys.set(q + ',' + r, xs.length);
      xs.push(x);
      ys.push(y);
      edge.push(distToPolyEdge(x, y, poly) < 0.95 || (hole !== null && distToPolyEdge(x, y, hole) < 1.1) ? 1 : 0);
    }
  }
  // faint board grid over the whole lattice (also where pegs were left out)
  const grid: number[] = [];
  const dirs = spec.lattice === 'tri' ? [[1, 0], [0, 1], [-1, 1]] : [[1, 0], [0, 1]];
  for (const [k, [x, y]] of all) {
    const [q, r] = k.split(',').map(Number);
    for (const [dq, dr] of dirs) {
      const o = all.get(q + dq + ',' + (r + dr));
      if (o) grid.push(x, y, o[0], o[1]);
    }
  }
  // Convex boards hug their pegs like the reference: the outline is the pegs' convex hull
  // grown by a constant margin, so every outer row sits the same distance from the frame.
  let outline = poly;
  if (CONVEX.has(spec.shape) && xs.length >= 3) {
    const h = hullOf(xs, ys);
    outline = outlineOf(h.map((i) => xs[i]), h.map((i) => ys[i]), HUG, Math.PI / 10);
    const keepGrid: number[] = [];
    for (let i = 0; i < grid.length; i += 4) {
      const inA = pointInPoly(grid[i], grid[i + 1], outline) && distToPolyEdge(grid[i], grid[i + 1], outline) > HUG * 0.5;
      const inB = pointInPoly(grid[i + 2], grid[i + 3], outline) && distToPolyEdge(grid[i + 2], grid[i + 3], outline) > HUG * 0.5;
      if (inA && inB) keepGrid.push(grid[i], grid[i + 1], grid[i + 2], grid[i + 3]);
    }
    grid.length = 0;
    grid.push(...keepGrid);
  }
  return { px: new Float32Array(xs), py: new Float32Array(ys), edge: new Uint8Array(edge), keys, grid: new Float32Array(grid), poly: new Float32Array(outline), hole: hole ? new Float32Array(hole) : null };
}

function rotate(lat: Lattice, q: number, r: number, k: number): [number, number] {
  for (let i = 0; i < k; i++) {
    if (lat === 'tri') [q, r] = [-r, q + r];
    else [q, r] = [-r, q];
  }
  return [q, r];
}

function tryGenerate(spec: LevelSpec, board: ReturnType<typeof buildBoard>, rand: () => number): { bands: Band[]; queue: number[]; simPeak: number } | null {
  const lat = spec.lattice;
  const T = lat === 'tri' ? TRI_TPL : SQ_TPL;
  const keyList = [...board.keys.keys()];
  const bands: Band[] = [];
  const used = new Set<string>();
  const pegUse = new Uint8Array(board.px.length);
  for (let i = 0; i < spec.bands; i++) {
    let placed = false;
    const wantOverlap = i > 0 && rand() < spec.overlap;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const relaxed = attempt > 160;
      const tpl = T[spec.tpl[Math.floor(rand() * spec.tpl.length)]];
      const rot = Math.floor(rand() * (lat === 'tri' ? 6 : 4));
      // pick the least crowded of a few random anchors, preferring the interior, so bands
      // spread over the whole board and the spare pegs end up along the border
      let anchor = keyList[Math.floor(rand() * keyList.length)];
      let bestScore = Infinity;
      for (let c = 0; c < 3; c++) {
        const k = keyList[Math.floor(rand() * keyList.length)];
        const id = board.keys.get(k)!;
        const sc = pegUse[id] * 0.6 + board.edge[id] * 2.5 + rand();
        if (sc < bestScore) { bestScore = sc; anchor = k; }
      }
      const [aq, ar] = anchor.split(',').map(Number);
      const pegs: number[] = [];
      let ok = true;
      for (const [q, r] of tpl) {
        const [rq, rr] = rotate(lat, q, r, rot);
        const idx = board.keys.get(aq + rq + ',' + (ar + rr));
        if (idx === undefined || pegUse[idx] >= 6) { ok = false; break; }
        pegs.push(idx);
      }
      if (!ok) continue;
      const key = pegs.slice().sort((a, b) => a - b).join(',');
      if (used.has(key)) continue;
      const band = makeBand(i, pegs, board.px, board.py, Math.PI / 3);
      // The band must lie on the board (outline away from the hole too).
      const hits: Band[] = [];
      for (const o of bands) if (crosses(o, band)) hits.push(o);
      const crossing = hits.length;
      if (!relaxed) {
        if (wantOverlap && (crossing < 1 || crossing > 4)) continue;
        if (!wantOverlap && crossing > 0) continue;
      } else if (crossing > (attempt > 240 ? 10 : 6)) continue;
      for (const o of hits) { o.above.push(i); band.below.push(o.id); }
      used.add(key);
      for (const p of pegs) pegUse[p]++;
      bands.push(band);
      placed = true;
    }
    if (!placed) return null;
  }
  // Colours: each colour gets a multiple of 3 bands.
  const groups = spec.bands / 3;
  const colorOrder: number[] = [];
  // Red, green and blue first (the reference palette), then purple, yellow, cyan, orange, pink.
  const pal = [0, 4, 5, 3, 2, 1, 6, 7].slice(0, spec.colors);
  for (let i = pal.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [pal[i], pal[j]] = [pal[j], pal[i]]; }
  for (let g = 0; g < groups; g++) for (let k = 0; k < 3; k++) colorOrder.push(pal[g % spec.colors]);
  for (let i = colorOrder.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [colorOrder[i], colorOrder[j]] = [colorOrder[j], colorOrder[i]]; }
  bands.forEach((b, i) => (b.color = colorOrder[i]));

  // Tray queue from a random legal removal order, built as it is played
  // (a tray appears for the colour that needs it). The order leans towards
  // bands that fit a showing tray, so a decent line always exists.
  const removed = new Uint8Array(bands.length);
  const queue: number[] = [];
  const trays: { color: number; count: number }[] = [];
  for (let i = 0; i < spec.trays; i++) trays.push({ color: -1, count: 0 });
  const holder: number[] = [];
  let simPeak = 0;
  const pull = () => {
    let changed = true;
    while (changed) {
      changed = false;
      for (const t of trays) if (t.color >= 0 && t.count >= 3) { t.color = -1; t.count = 0; changed = true; }
      for (const t of trays) {
        if (t.color < 0 && holder.length > 0) { t.color = holder[0]; t.count = 0; queue.push(t.color); changed = true; }
      }
      for (let h = 0; h < holder.length; h++) {
        const t = trays.find((tt) => tt.color === holder[h] && tt.count < 3);
        if (t) { t.count++; holder.splice(h, 1); h--; changed = true; }
      }
    }
  };
  const focus = spec.trays === 1 ? 0.85 : 0.6;
  for (let step = 0; step < bands.length; step++) {
    const free: number[] = [];
    const fits: number[] = [];
    for (let id = 0; id < bands.length; id++) {
      if (!isFree(bands, removed, id)) continue;
      free.push(id);
      if (trays.some((tt) => tt.color === bands[id].color && tt.count < 3)) fits.push(id);
    }
    const pool = fits.length > 0 && rand() < focus ? fits : free;
    const id = pool[Math.floor(rand() * pool.length)];
    removed[id] = 1;
    const c = bands[id].color;
    const t = trays.find((tt) => tt.color === c && tt.count < 3);
    if (t) t.count++;
    else {
      const p = trays.find((tt) => tt.color < 0);
      if (p) { p.color = c; p.count = 1; queue.push(c); } else holder.push(c);
    }
    simPeak = Math.max(simPeak, holder.length);
    pull();
  }
  return { bands, queue, simPeak };
}

const cache = new Map<number, Level>();

type Gen = { bands: Band[]; queue: number[]; simPeak: number; peak: number; fit: number };

function generate(index: number, spec: LevelSpec, board: ReturnType<typeof buildBoard>): Gen | null {
  // The holder must never fill up (a full holder loses), so the solver may use one slot fewer.
  const cap = spec.holder - 1;
  let best: Gen | null = null;
  for (let attempt = 0; attempt < 30; attempt++) {
    const rand = mulberry(index * 7919 + attempt * 104729 + 17);
    const g = tryGenerate(spec, board, rand);
    if (!g) continue;
    // Hard levels: shuffle the tray queue a little so the obvious order fails —
    // but only keep a shuffle the solver can still beat with the holder we give.
    let peak = Math.min(g.simPeak, bestPeak(g.bands, g.queue, spec.trays, 9, index * 31 + attempt));
    const swaps = spec.diff === 'superhard' ? 5 : spec.diff === 'hard' ? 3 : 0;
    for (let k = 0; k < swaps; k++) {
      const i = Math.floor(rand() * Math.max(1, g.queue.length - 1));
      const q = g.queue.slice();
      [q[i], q[i + 1]] = [q[i + 1], q[i]];
      const p = bestPeak(g.bands, q, spec.trays, cap, index * 31 + attempt + k);
      if (isFinite(p) && (p >= peak || peak > cap)) { g.queue = q; peak = p; }
    }
    if (peak > cap) {
      if (!best) best = { ...g, peak, fit: 100 + peak };
      continue;
    }
    const want = spec.diff === 'normal' ? Math.min(cap - 2, 1 + Math.floor(index / 4)) : cap - 1;
    const fit = spec.diff === 'normal' ? Math.abs(peak - want) : Math.max(0, want - peak);
    if (!best || fit < best.fit) best = { ...g, peak, fit };
    if (fit === 0) break;
  }
  return best;
}

/** Share of pegs no band uses. */
function spareOf(bands: Band[], pegs: number): number {
  const used = new Set<number>();
  for (const b of bands) for (const p of b.pegs) used.add(p);
  return 1 - used.size / Math.max(1, pegs);
}

/** Board scale factors tried (in order) when looking for the spare-peg target. */
// Sizes in SPECS are already tuned for ~30% spare pegs (found offline with a wider
// search), so normally only the first step runs; the rest are a safety net.
export let SIZE_STEPS = [1, 0.92, 1.08];
export function setSizeSteps(v: number[]): void {
  SIZE_STEPS = v;
}

/** Target share of spare pegs: enough to keep the board full, not so many that it looks empty. */
const SPARE = 0.3;

export function getLevel(index: number): Level {
  const hit = cache.get(index);
  if (hit) return hit;
  const base = SPECS[index - 1];
  // Try a few board sizes and keep the one whose spare pegs are closest to ~30%.
  let pick: { spec: LevelSpec; board: ReturnType<typeof buildBoard>; g: Gen; score: number } | null = null;
  for (const f of SIZE_STEPS) {
    const spec = { ...base, size: base.size * f };
    const board = buildBoard(spec, index * 977 + 3);
    if (board.px.length < 6) continue;
    const g = generate(index, spec, board);
    if (!g) continue;
    const spare = spareOf(g.bands, board.px.length);
    const score = (g.fit >= 100 ? 10 : 0) + Math.abs(spare - SPARE) * 4 + g.fit * 0.3 + Math.abs(f - 1) * 0.8;
    if (!pick || score < pick.score) pick = { spec, board, g, score };
    if (g.fit < 100) break;
  }
  if (!pick) throw new Error('level ' + index + ' could not be generated');
  const { spec, board, g: best } = pick;
  const holder = Math.max(spec.holder, best.peak + 1);
  const lock = addLock(index, best.bands, best.queue, spec.trays, holder - 1);
  const level: Level = {
    spec, index, pegX: board.px, pegY: board.py, grid: board.grid, poly: board.poly, hole: board.hole,
    bands: best.bands, queue: best.queue, holder, peak: best.peak, lock,
  };
  cache.set(index, level);
  return level;
}
