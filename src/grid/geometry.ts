/**
 * Pure grid geometry for drawing a hive: cell centers, polygon points, view bounds, screen
 * angles of the six directions, neighbor lookup and reading order, for pointy-top and
 * flat-top presentation.
 *
 * Screen space: x grows right, y grows down (SVG/CSS). Angles are degrees counter-clockwise
 * from screen-right, so "up" is 90° and "down" is 270°.
 *
 * The domain grid (`../core/hex`) is pointy-top. 'flat' rotates the drawing by 30° clockwise;
 * axial coordinates, neighbors and direction names stay the same.
 */
import {
  HEX_DIRECTIONS,
  HEX_ORIGIN,
  hexCorners,
  hexEquals,
  hexNeighbor,
  hexToPlane,
  type HexCoord,
  type HexDirection,
  type PlanePoint,
} from '../core/hex';

export type GridOrientation = 'pointy' | 'flat';

export const GRID_ORIENTATIONS: readonly GridOrientation[] = ['pointy', 'flat'];

/** Minimal cell shape the grid functions need. Extra fields are carried through untouched. */
export interface GridCell {
  readonly id: string;
  readonly coord: HexCoord;
  /** Optional label; unused by the math, kept for renderers that default to it. */
  readonly title?: string | undefined;
}

export interface GridBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const COS30 = Math.sqrt(3) / 2;

/** Map a point of the pointy-top layout into `orientation` ('flat' = 30° clockwise on screen). */
export function orientPoint(point: PlanePoint, orientation: GridOrientation): PlanePoint {
  return orientation === 'pointy'
    ? point
    : { x: COS30 * point.x - point.y / 2, y: point.x / 2 + COS30 * point.y };
}

/** Screen position of a cell center for circumradius `radius`. */
export function gridPoint(coord: HexCoord, radius: number, orientation: GridOrientation = 'pointy'): PlanePoint {
  return orientPoint(hexToPlane(coord, radius), orientation);
}

/** Six corners of a cell polygon centered on (0, 0). */
export function gridCorners(radius: number, orientation: GridOrientation = 'pointy'): PlanePoint[] {
  return hexCorners(HEX_ORIGIN, radius).map((point) => orientPoint(point, orientation));
}

/** Cell polygon as an SVG `points` attribute ("x,y x,y …"), centered on (0, 0). */
export function gridPolygon(radius: number, orientation: GridOrientation = 'pointy'): string {
  return gridCorners(radius, orientation)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

/**
 * Bounding box of all cell centers, padded by `pad` on every side (default `radius + 8`, which
 * fits whole cells plus a small margin). Empty input gives a box of size 2·pad around (0, 0).
 */
export function gridBounds(
  cells: readonly Pick<GridCell, 'coord'>[],
  radius: number,
  orientation: GridOrientation = 'pointy',
  pad: number = radius + 8,
): GridBounds {
  if (cells.length === 0) return { x: -pad, y: -pad, width: 2 * pad, height: 2 * pad };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const cell of cells) {
    const p = gridPoint(cell.coord, radius, orientation);
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad };
}

/** Normalize degrees to [0, 360). */
export function normalizeAngle(degrees: number): number {
  const a = degrees % 360;
  return a < 0 ? a + 360 : a + 0;
}

/**
 * On-screen angle of a hex direction in degrees, [0, 360).
 * pointy: E 0, NE 60, NW 120, W 180, SW 240, SE 300.
 * flat:   E 330, NE 30, NW 90, W 150, SW 210, SE 270.
 */
export function directionAngle(dir: HexDirection, orientation: GridOrientation = 'pointy'): number {
  const pointy = HEX_DIRECTIONS.indexOf(dir) * 60;
  return orientation === 'pointy' ? pointy : normalizeAngle(pointy - 30);
}

/** Angles closer than this (degrees) count as a tie. */
const TIE_EPSILON = 1e-9;

/** A screen angle resolved to hex directions (see `nearestDirections`). */
export interface NearestDirections {
  /** The nearest direction. On a tie, the one counter-clockwise of the angle. */
  readonly direction: HexDirection;
  /** Present only on a tie: the other (clockwise) of the two equally near directions. */
  readonly fallback?: HexDirection;
}

/**
 * The hex direction whose on-screen angle is nearest to `angle` (degrees, counter-clockwise from
 * screen-right), plus the runner-up when the angle lies exactly between two directions.
 *
 * Tie-break: when two directions are equally near (e.g. 90° in pointy-top lies between NE at 60°
 * and NW at 120°), the counter-clockwise one becomes `direction` and the clockwise one `fallback`.
 * Without a tie there is no `fallback`. Opposite angles resolve to opposite directions and
 * opposite fallbacks. `gridAction` tries `fallback` only when the `direction` slot is empty or
 * disabled, which keeps every neighbor reachable by arrow keys alone.
 *
 * @throws RangeError if `angle` is not a finite number.
 */
export function nearestDirections(angle: number, orientation: GridOrientation = 'pointy'): NearestDirections {
  if (!Number.isFinite(angle)) throw new RangeError(`nearestDirections: angle must be finite, got ${angle}`);
  const target = normalizeAngle(angle);
  // Counter-clockwise offset from the angle to a direction, [0, 360), and the shorter way round.
  const offset = (dir: HexDirection): number => normalizeAngle(directionAngle(dir, orientation) - target);
  const distance = (dir: HexDirection): number => Math.min(offset(dir), 360 - offset(dir));
  const tied = (a: HexDirection, b: HexDirection): boolean => Math.abs(distance(a) - distance(b)) <= TIE_EPSILON;
  let direction: HexDirection = HEX_DIRECTIONS[0];
  for (const dir of HEX_DIRECTIONS) {
    const nearer = distance(dir) < distance(direction) - TIE_EPSILON;
    const tieWonCounterClockwise = tied(dir, direction) && offset(dir) < offset(direction);
    if (nearer || tieWonCounterClockwise) direction = dir;
  }
  // Directions are 60° apart, so at most one other direction ties with the nearest.
  const fallback = HEX_DIRECTIONS.find((dir) => dir !== direction && tied(dir, direction));
  return fallback === undefined ? { direction } : { direction, fallback };
}

/**
 * The single hex direction nearest to `angle`: `nearestDirections(angle, orientation).direction`
 * (counter-clockwise tie-break).
 *
 * @throws RangeError if `angle` is not a finite number.
 */
export function nearestDirection(angle: number, orientation: GridOrientation = 'pointy'): HexDirection {
  return nearestDirections(angle, orientation).direction;
}

/** The cell one step from `current` in `dir`, if present in `cells`. Missing slots are never skipped. */
export function gridNeighbor<T extends Pick<GridCell, 'coord'>>(
  cells: readonly T[],
  current: Pick<GridCell, 'coord'>,
  dir: HexDirection,
): T | undefined {
  const target = hexNeighbor(current.coord, dir);
  return cells.find((cell) => hexEquals(cell.coord, target));
}

/**
 * Integer sort key for screen reading order (top-to-bottom, then left-to-right).
 * pointy: row r, column q. flat: centers sit at y ∝ q + 2r and x ∝ q.
 */
function readingKey(coord: HexCoord, orientation: GridOrientation): readonly [number, number] {
  return orientation === 'pointy' ? [coord.r, coord.q] : [coord.q + 2 * coord.r, coord.q];
}

/** Cells sorted in screen reading order for `orientation` (new array; input untouched). */
export function readingOrder<T extends Pick<GridCell, 'coord'>>(
  cells: readonly T[],
  orientation: GridOrientation = 'pointy',
): T[] {
  return [...cells].sort((a, b) => {
    const [ay, ax] = readingKey(a.coord, orientation);
    const [by, bx] = readingKey(b.coord, orientation);
    return ay - by || ax - bx;
  });
}
