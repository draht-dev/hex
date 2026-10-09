import { describe, expect, test } from 'bun:test';
import { HEX_DIRECTIONS, directionVector, hex, hexSpiral, oppositeDirection, type HexCoord } from '../src/core';
import {
  GRID_ORIENTATIONS,
  directionAngle,
  gridBounds,
  gridCorners,
  gridNeighbor,
  gridPoint,
  gridPolygon,
  nearestDirection,
  nearestDirections,
  normalizeAngle,
  orientPoint,
  readingOrder,
  type GridCell,
} from '../src/grid';

const R = 48;
const cells: GridCell[] = [
  { id: 'center', coord: { q: 0, r: 0 } },
  { id: 'east', coord: { q: 1, r: 0 } },
  { id: 'north', coord: { q: 0, r: -1 } },
];
const screenAngle = (p: { x: number; y: number }): number => normalizeAngle((Math.atan2(-p.y, p.x) * 180) / Math.PI);

describe('grid geometry', () => {
  test('orientation changes only presentation: six equal edges, corner radius, neighbor spacing, bounds', () => {
    for (const orientation of GRID_ORIENTATIONS) {
      const corners = gridPolygon(R, orientation)
        .split(' ')
        .map((pair) => pair.split(',').map(Number));
      expect(corners).toHaveLength(6);
      for (const [x, y] of corners) expect(Math.hypot(x!, y!)).toBeCloseTo(R, 8);
      for (let i = 0; i < 6; i++) {
        const [ax, ay] = corners[i]!;
        const [bx, by] = corners[(i + 1) % 6]!;
        expect(Math.hypot(bx! - ax!, by! - ay!)).toBeCloseTo(R, 8);
      }
      for (const dir of HEX_DIRECTIONS) {
        const p = gridPoint(directionVector(dir), R, orientation);
        expect(Math.hypot(p.x, p.y)).toBeCloseTo(Math.sqrt(3) * R, 8);
      }
      const bounds = gridBounds(cells, R, orientation);
      for (const cell of cells) {
        const point = gridPoint(cell.coord, R, orientation);
        expect(point.x - R).toBeGreaterThanOrEqual(bounds.x);
        expect(point.y - R).toBeGreaterThanOrEqual(bounds.y);
        expect(point.x + R).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(point.y + R).toBeLessThanOrEqual(bounds.y + bounds.height);
      }
    }
  });

  test('pointy has a top corner, flat has a right corner', () => {
    const pointy = gridCorners(R, 'pointy');
    expect(pointy[0]!.x).toBeCloseTo(0, 8);
    expect(pointy[0]!.y).toBeCloseTo(-R, 8);
    const flat = gridCorners(R, 'flat');
    expect(flat.some((p) => Math.abs(p.x - R) < 1e-9 && Math.abs(p.y) < 1e-9)).toBe(true);
    expect(flat.some((p) => Math.abs(p.y + R) < 1e-9)).toBe(false);
  });

  test('cell centers follow the standard axial layouts', () => {
    for (const c of hexSpiral(hex(0, 0), 3)) {
      const p = gridPoint(c, 10, 'pointy');
      expect(p.x).toBeCloseTo(10 * Math.sqrt(3) * (c.q + c.r / 2), 8);
      expect(p.y).toBeCloseTo(10 * 1.5 * c.r, 8);
      const f = gridPoint(c, 10, 'flat');
      expect(f.x).toBeCloseTo(10 * 1.5 * c.q, 8);
      expect(f.y).toBeCloseTo(10 * Math.sqrt(3) * (c.r + c.q / 2), 8);
    }
    expect(gridPoint(hex(2, -1), 10)).toEqual(gridPoint(hex(2, -1), 10, 'pointy'));
    const p = { x: 3, y: 4 };
    expect(orientPoint(p, 'pointy')).toBe(p);
  });

  test('gridBounds: empty grid, default and custom padding', () => {
    expect(gridBounds([], R)).toEqual({ x: -(R + 8), y: -(R + 8), width: 2 * (R + 8), height: 2 * (R + 8) });
    expect(gridBounds([], R, 'flat', 5)).toEqual({ x: -5, y: -5, width: 10, height: 10 });
    const b = gridBounds([{ coord: hex(0, 0) }, { coord: hex(2, 0) }], 10, 'pointy', 0);
    expect(b.x).toBeCloseTo(0, 8);
    expect(b.width).toBeCloseTo(20 * Math.sqrt(3), 8);
    expect(b.height).toBeCloseTo(0, 8);
  });
});

describe('direction angles', () => {
  test('table values', () => {
    expect(HEX_DIRECTIONS.map((d) => directionAngle(d, 'pointy'))).toEqual([0, 60, 120, 180, 240, 300]);
    expect(HEX_DIRECTIONS.map((d) => directionAngle(d, 'flat'))).toEqual([330, 30, 90, 150, 210, 270]);
    expect(directionAngle('NE')).toBe(60);
  });

  test('match the drawn geometry in both orientations', () => {
    for (const orientation of GRID_ORIENTATIONS) {
      for (const dir of HEX_DIRECTIONS) {
        const drawn = screenAngle(gridPoint(directionVector(dir), 1, orientation));
        expect(drawn).toBeCloseTo(directionAngle(dir, orientation), 8);
      }
    }
  });

  test('nearestDirection: exact angles, near angles, wrap-around', () => {
    for (const orientation of GRID_ORIENTATIONS) {
      for (const dir of HEX_DIRECTIONS) {
        const a = directionAngle(dir, orientation);
        expect(nearestDirection(a, orientation)).toBe(dir);
        expect(nearestDirection(a + 29, orientation)).toBe(dir);
        expect(nearestDirection(a - 29, orientation)).toBe(dir);
        expect(nearestDirection(a + 720, orientation)).toBe(dir);
        expect(nearestDirection(a - 360, orientation)).toBe(dir);
      }
    }
    expect(nearestDirection(100, 'pointy')).toBe('NW');
    expect(nearestDirection(-10, 'flat')).toBe('E');
  });

  test('nearestDirection tie-break: the counter-clockwise candidate wins', () => {
    expect(nearestDirection(90, 'pointy')).toBe('NW'); // NE 60 vs NW 120
    expect(nearestDirection(270, 'pointy')).toBe('SE'); // SW 240 vs SE 300
    expect(nearestDirection(30, 'pointy')).toBe('NE'); // E 0 vs NE 60
    expect(nearestDirection(0, 'flat')).toBe('NE'); // E 330 vs NE 30
    expect(nearestDirection(180, 'flat')).toBe('SW'); // W 150 vs SW 210
    expect(nearestDirection(60, 'flat')).toBe('NW'); // NE 30 vs NW 90
  });

  test('nearestDirections: fallback exactly on ties, clockwise of the angle', () => {
    expect(nearestDirections(90, 'pointy')).toStrictEqual({ direction: 'NW', fallback: 'NE' });
    expect(nearestDirections(270, 'pointy')).toStrictEqual({ direction: 'SE', fallback: 'SW' });
    expect(nearestDirections(0, 'flat')).toStrictEqual({ direction: 'NE', fallback: 'E' });
    expect(nearestDirections(180, 'flat')).toStrictEqual({ direction: 'SW', fallback: 'W' });
    expect(nearestDirections(90 + 360, 'pointy')).toStrictEqual({ direction: 'NW', fallback: 'NE' });
    expect(nearestDirections(0, 'pointy')).toStrictEqual({ direction: 'E' });
    expect(nearestDirections(91, 'pointy')).toStrictEqual({ direction: 'NW' });
    expect(nearestDirections(89, 'pointy')).toStrictEqual({ direction: 'NE' });
    for (const orientation of GRID_ORIENTATIONS) {
      for (let a = 0; a < 360; a += 5) {
        const { direction, fallback } = nearestDirections(a, orientation);
        expect(direction).toBe(nearestDirection(a, orientation));
        const isTie = HEX_DIRECTIONS.some((dir) => normalizeAngle(directionAngle(dir, orientation) - a) === 30);
        expect(fallback !== undefined).toBe(isTie);
        if (fallback) expect(normalizeAngle(directionAngle(fallback, orientation) - a)).toBe(330);
      }
    }
    expect(() => nearestDirections(Number.NaN)).toThrow(RangeError);
  });

  test('opposite angles always resolve to opposite directions (moves are reversible)', () => {
    for (const orientation of GRID_ORIENTATIONS) {
      for (let a = 0; a < 360; a += 5) {
        expect(nearestDirection(a + 180, orientation)).toBe(oppositeDirection(nearestDirection(a, orientation)));
        const { fallback } = nearestDirections(a, orientation);
        expect(nearestDirections(a + 180, orientation).fallback).toBe(fallback && oppositeDirection(fallback));
      }
    }
  });

  test('nearestDirection rejects non-finite angles', () => {
    expect(() => nearestDirection(Number.NaN)).toThrow(RangeError);
    expect(() => nearestDirection(Number.POSITIVE_INFINITY, 'flat')).toThrow(RangeError);
  });

  test('normalizeAngle', () => {
    expect(normalizeAngle(-30)).toBe(330);
    expect(normalizeAngle(720)).toBe(0);
    expect(Object.is(normalizeAngle(-0), 0)).toBe(true);
    expect(Object.is(normalizeAngle(-360), 0)).toBe(true);
  });
});

describe('neighbors and reading order', () => {
  test('gridNeighbor finds only the adjacent cell and never skips a gap', () => {
    expect(gridNeighbor(cells, cells[0]!, 'E')?.id).toBe('east');
    expect(gridNeighbor(cells, cells[0]!, 'NW')?.id).toBe('north');
    expect(gridNeighbor(cells, cells[0]!, 'W')).toBeUndefined();
    const gapped = [...cells, { id: 'far-west', coord: { q: -2, r: 0 } }];
    expect(gridNeighbor(gapped, cells[0]!, 'W')).toBeUndefined();
  });

  test('readingOrder sorts top-to-bottom, then left-to-right on screen, in both orientations', () => {
    const spiral = hexSpiral(hex(0, 0), 3).map((coord, i) => ({ id: `c${i}`, coord }));
    for (const orientation of GRID_ORIENTATIONS) {
      const expected = [...spiral]
        .map((c) => ({ c, p: gridPoint(c.coord, 10, orientation) }))
        .sort((a, b) => Math.round(a.p.y * 1e6) - Math.round(b.p.y * 1e6) || a.p.x - b.p.x)
        .map(({ c }) => c.id);
      expect(readingOrder(spiral, orientation).map((c) => c.id)).toEqual(expected);
    }
  });

  test('readingOrder differs between orientations and leaves the input untouched', () => {
    const coords: HexCoord[] = [hex(1, -1), hex(-1, 0), hex(0, 0)];
    const input = coords.map((coord, i) => ({ id: String(i), coord }));
    const before = input.map((c) => c.id);
    // pointy: (1,-1) is in the top row. flat: (1,-1) sits at y ∝ -1, (-1,0) at y ∝ -1, (0,0) at 0.
    expect(readingOrder(input, 'pointy').map((c) => c.id)).toEqual(['0', '1', '2']);
    expect(readingOrder(input, 'flat').map((c) => c.id)).toEqual(['1', '0', '2']);
    expect(readingOrder(input).map((c) => c.id)).toEqual(['0', '1', '2']);
    expect(input.map((c) => c.id)).toEqual(before);
  });
});
