import { describe, expect, test } from 'bun:test';
import {
  HEX_DIRECTIONS,
  directionTo,
  hex,
  hexCorners,
  hexDistance,
  hexKey,
  hexNeighbor,
  hexNeighbors,
  hexRing,
  hexRound,
  hexSpiral,
  hexToPlane,
  oppositeDirection,
  parseHexKey,
  planeToHex,
} from '../src/core';

describe('hex math (axial, pointy-top)', () => {
  test('six neighbors, all at distance 1, stable direction order', () => {
    const n = hexNeighbors(hex(2, -1));
    expect(n.map((x) => x.dir)).toEqual([...HEX_DIRECTIONS]);
    expect(n.map((x) => hexKey(x.coord))).toEqual(['3,-1', '3,-2', '2,-2', '1,-1', '1,0', '2,0']);
    for (const x of n) expect(hexDistance(hex(2, -1), x.coord)).toBe(1);
  });

  test('opposite direction round-trips and directionTo', () => {
    for (const d of HEX_DIRECTIONS) {
      const o = oppositeDirection(d);
      expect(hexNeighbor(hexNeighbor(hex(0, 0), d), o)).toEqual(hex(0, 0));
      expect(directionTo(hex(0, 0), hexNeighbor(hex(0, 0), d))).toBe(d);
    }
    expect(directionTo(hex(0, 0), hex(2, 0))).toBeUndefined();
  });

  test('distance, ring and spiral sizes', () => {
    expect(hexDistance(hex(0, 0), hex(3, -1))).toBe(3);
    expect(hexDistance(hex(-2, 3), hex(1, -1))).toBe(4);
    expect(hexRing(hex(0, 0), 0)).toHaveLength(1);
    for (const r of [1, 2, 3]) {
      const ring = hexRing(hex(1, 1), r);
      expect(ring).toHaveLength(6 * r);
      expect(new Set(ring.map(hexKey)).size).toBe(6 * r);
      for (const c of ring) expect(hexDistance(hex(1, 1), c)).toBe(r);
    }
    expect(hexSpiral(hex(0, 0), 3)).toHaveLength(1 + 3 * 3 * 4);
  });

  test('keys, rounding, plane round-trip, corners', () => {
    expect(parseHexKey(hexKey(hex(-4, 7)))).toEqual(hex(-4, 7));
    expect(() => parseHexKey('a,b')).toThrow();
    expect(hexRound({ q: 0.2, r: 0.1 })).toEqual(hex(0, 0));
    expect(hexRound({ q: 0.4, r: 0.3 })).toEqual(hex(1, 0)); // cube (0.4,0.3,-0.7) is closer to (1,0,-1)
    expect(hexRound({ q: 0.9, r: -0.1 })).toEqual(hex(1, 0));
    for (const c of hexSpiral(hex(0, 0), 4)) {
      expect(planeToHex(hexToPlane(c, 10), 10)).toEqual(c);
    }
    const p = hexToPlane(hex(1, 0), 10);
    expect(p.x).toBeCloseTo(10 * Math.sqrt(3));
    expect(p.y).toBeCloseTo(0);
    expect(hexCorners(hex(0, 0), 10)[0]!.y).toBeCloseTo(-10); // pointy top
  });
});
