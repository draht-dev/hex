/**
 * Hex coordinates: axial (q, r) with implicit cube s = -q - r, **pointy-top** orientation.
 * Reference math: https://www.redblobgames.com/grids/hexagons/ (axial/cube).
 * Pure functions, no I/O.
 *
 * Direction names (E, NE, NW, W, SW, SE) describe the pointy-top layout. A flat-top
 * presentation is a screen rotation done in `../grid` and does not change coordinates,
 * neighbors or direction names; use `directionAngle()` from `../grid` for screen angles.
 */

/** Axial hex coordinate. Integer for cells/tiles; fractional only as input to {@link hexRound}. */
export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

/** Cube coordinate (q + r + s = 0). */
export interface CubeCoord {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

/**
 * Six neighbor directions for pointy-top hexes, index 0..5, counter-clockwise from east.
 * Stable order: renderers and navigation UIs may rely on it.
 */
export const HEX_DIRECTIONS = ['E', 'NE', 'NW', 'W', 'SW', 'SE'] as const;
export type HexDirection = (typeof HEX_DIRECTIONS)[number];

const DIR_VECTORS: Readonly<Record<HexDirection, HexCoord>> = {
  E: { q: 1, r: 0 },
  NE: { q: 1, r: -1 },
  NW: { q: 0, r: -1 },
  W: { q: -1, r: 0 },
  SW: { q: -1, r: 1 },
  SE: { q: 0, r: 1 },
};

export const HEX_ORIGIN: HexCoord = { q: 0, r: 0 };

export function hex(q: number, r: number): HexCoord {
  return { q, r };
}

/** Stable string key, e.g. "3,-1". Use for maps/sets and serialized state. */
export function hexKey(h: HexCoord): string {
  return `${h.q},${h.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  if (!Number.isInteger(q) || !Number.isInteger(r)) throw new Error(`invalid hex key: ${key}`);
  return { q: q as number, r: r as number };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q + b.q, r: a.r + b.r };
}

export function hexSub(a: HexCoord, b: HexCoord): HexCoord {
  return { q: a.q - b.q, r: a.r - b.r };
}

export function hexScale(a: HexCoord, k: number): HexCoord {
  return { q: a.q * k, r: a.r * k };
}

export function toCube(h: HexCoord): CubeCoord {
  return { q: h.q, r: h.r, s: -h.q - h.r };
}

export function directionVector(dir: HexDirection): HexCoord {
  return DIR_VECTORS[dir];
}

/** The opposite direction (E↔W, NE↔SW, NW↔SE). */
export function oppositeDirection(dir: HexDirection): HexDirection {
  const i = HEX_DIRECTIONS.indexOf(dir);
  return HEX_DIRECTIONS[(i + 3) % 6]!;
}

export function hexNeighbor(h: HexCoord, dir: HexDirection): HexCoord {
  return hexAdd(h, DIR_VECTORS[dir]);
}

/** All six neighbors in {@link HEX_DIRECTIONS} order. */
export function hexNeighbors(h: HexCoord): Array<{ dir: HexDirection; coord: HexCoord }> {
  return HEX_DIRECTIONS.map((dir) => ({ dir, coord: hexNeighbor(h, dir) }));
}

/** Direction from a to an adjacent b, or undefined if not adjacent. */
export function directionTo(a: HexCoord, b: HexCoord): HexDirection | undefined {
  const d = hexSub(b, a);
  return HEX_DIRECTIONS.find((dir) => hexEquals(DIR_VECTORS[dir], d));
}

/** Grid distance in steps. */
export function hexDistance(a: HexCoord, b: HexCoord): number {
  const d = toCube(hexSub(a, b));
  return Math.max(Math.abs(d.q), Math.abs(d.r), Math.abs(d.s));
}

/** Cells at exactly `radius` steps (radius 0 → [center]). Order: starts SW·radius, walks E, NE, … */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius <= 0) return [center];
  const out: HexCoord[] = [];
  let cur = hexAdd(center, hexScale(DIR_VECTORS.SW, radius));
  for (const dir of HEX_DIRECTIONS) {
    for (let i = 0; i < radius; i++) {
      out.push(cur);
      cur = hexNeighbor(cur, dir);
    }
  }
  return out;
}

/** Center first, then rings 1..radius. Count = 1 + 3·radius·(radius+1). */
export function hexSpiral(center: HexCoord, radius: number): HexCoord[] {
  const out: HexCoord[] = [center];
  for (let k = 1; k <= radius; k++) out.push(...hexRing(center, k));
  return out;
}

/** Round a fractional axial coordinate to the containing hex. */
export function hexRound(h: { q: number; r: number }): HexCoord {
  const s = -h.q - h.r;
  let rq = Math.round(h.q);
  let rr = Math.round(h.r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - h.q);
  const dr = Math.abs(rr - h.r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq + 0, r: rr + 0 }; // +0 normalizes -0
}

/** 2D plane point (x right/east, y down/south in hex layout space). */
export interface PlanePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Hex center on a plane for pointy-top hexes of circumradius `size`.
 * Renderers map this to screen (2D) or ground plane (3D); y grows toward "south" (SE/SW).
 */
export function hexToPlane(h: HexCoord, size: number): PlanePoint {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    y: size * 1.5 * h.r,
  };
}

/** Inverse of {@link hexToPlane}: containing hex for a plane point. */
export function planeToHex(p: PlanePoint, size: number): HexCoord {
  const q = ((Math.sqrt(3) / 3) * p.x - (1 / 3) * p.y) / size;
  const r = ((2 / 3) * p.y) / size;
  return hexRound({ q, r });
}

/** Six corner points (pointy-top, starting at the top corner, clockwise). */
export function hexCorners(h: HexCoord, size: number): PlanePoint[] {
  const c = hexToPlane(h, size);
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (60 * i - 90);
    return { x: c.x + size * Math.cos(a), y: c.y + size * Math.sin(a) };
  });
}
