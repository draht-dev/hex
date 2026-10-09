import { describe, expect, test } from 'bun:test';
import * as core from '../src/core';
import { CELL_KINDS, attachSlots, canAttach, hex, isCellKind, navigate, neighborSlots, type Cell, type CellKind, type LevelRef } from '../src/core';

const uni: LevelRef = { kind: 'university', id: 'uni' };
const cell = (id: string, q: number, r: number): Cell => ({ id, level: uni, coord: hex(q, r), kind: 'topic', title: id });

describe('knowledge hive', () => {
  const cells = [cell('root', 0, 0), cell('east', 1, 0), cell('ne', 1, -1)];

  test('neighbor slots: filled and empty in direction order', () => {
    const slots = neighborSlots(cells[0]!, cells);
    expect(slots.map((s) => [s.dir, s.cell?.id ?? null])).toEqual([
      ['E', 'east'],
      ['NE', 'ne'],
      ['NW', null],
      ['W', null],
      ['SW', null],
      ['SE', null],
    ]);
  });

  test('navigate to a neighbor', () => {
    expect(navigate(cells[0]!, 'E', cells)?.id).toBe('east');
    expect(navigate(cells[0]!, 'W', cells)).toBeUndefined();
    expect(navigate(cells[1]!, 'NW', cells)?.id).toBe('ne');
  });

  test('growth rule: attach only next to an existing cell', () => {
    expect(canAttach(hex(0, 0), [])).toEqual({ ok: true });
    expect(canAttach(hex(1, 0), [])).toEqual({ ok: false, reason: 'not-root' });
    expect(canAttach(hex(1, 0), cells)).toEqual({ ok: false, reason: 'occupied' });
    expect(canAttach(hex(-1, 0), cells)).toEqual({ ok: true });
    expect(canAttach(hex(5, 5), cells)).toEqual({ ok: false, reason: 'not-adjacent' });
    const slots = attachSlots(cells);
    expect(slots.every((s) => canAttach(s, cells).ok)).toBe(true);
  });

  test('the core builds no URLs: apps own their route scheme', () => {
    expect(Object.keys(core)).not.toContain('levelPath');
  });
});

describe('cell kinds', () => {
  test('CELL_KINDS lists every CellKind exactly once', () => {
    // Record<CellKind, …> fails to compile when a kind is missing or unknown.
    const every: Record<CellKind, true> = { topic: true, lesson: true, episode: true, exercise: true, course: true, link: true, 'level-portal': true };
    const listed: string[] = [...CELL_KINDS].sort();
    expect(listed).toEqual(Object.keys(every).sort());
    expect(new Set(CELL_KINDS).size).toBe(CELL_KINDS.length);
  });

  test('isCellKind accepts exactly the closed set', () => {
    for (const kind of CELL_KINDS) expect(isCellKind(kind)).toBe(true);
    for (const value of ['Course', 'courses', 'portal', '', null, undefined, 1, {}, ['course']]) expect(isCellKind(value)).toBe(false);
  });

  test('a course cell with a route target follows the same hive rules as a topic cell', () => {
    const cells = [cell('root', 0, 0), cell('east', 1, 0)];
    const course: Cell = { id: 'course', level: uni, coord: hex(-1, 0), kind: 'course', title: 'Course', target: { type: 'route', path: '/courses/x/' } };
    const withCourse = [...cells, course];
    const withTopic = [...cells, { ...course, kind: 'topic' } satisfies Cell];
    // Occupies its slot, and counts as a neighbor for the growth rule: (-2, 0) touches only the course.
    expect(canAttach(hex(-1, 0), withCourse)).toEqual({ ok: false, reason: 'occupied' });
    expect(canAttach(hex(-2, 0), cells)).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(canAttach(hex(-2, 0), withCourse)).toEqual({ ok: true });
    expect(attachSlots(withCourse)).toEqual(attachSlots(withTopic));
    // Navigation and neighbor slots see it like any other cell.
    expect(navigate(cells[0]!, 'W', withCourse)).toBe(course);
    expect(navigate(course, 'E', withCourse)?.id).toBe('root');
    expect(neighborSlots(cells[0]!, withCourse).find((s) => s.dir === 'W')?.cell).toBe(course);
    expect(neighborSlots(course, withCourse).map((s) => s.cell?.id ?? null)).toEqual(neighborSlots(course, withTopic).map((s) => s.cell?.id ?? null));
  });
});
