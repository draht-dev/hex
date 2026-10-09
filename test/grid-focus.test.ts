import { describe, expect, test } from 'bun:test';
import { HEX_DIRECTIONS, hex, hexNeighbor, hexSpiral, oppositeDirection, type HexCoord } from '../src/core';
import {
  DEFAULT_KEYMAP,
  UP_LEVEL_KEYS,
  focusableCells,
  gridAction,
  gridMove,
  gridTabStop,
  keyIntent,
  type GridCell,
  type GridOrientation,
  type KeyEventLike,
} from '../src/grid';

interface TestCell extends GridCell {
  readonly disabled?: boolean;
}

const at = (id: string, q: number, r: number, disabled = false): TestCell => ({ id, coord: hex(q, r), disabled });
const isDisabled = (c: TestCell): boolean => c.disabled === true;
const ORIENTATIONS: readonly GridOrientation[] = ['pointy', 'flat'];

// A small level: center, its six neighbors, and one cell further out.
const level: TestCell[] = [
  at('center', 0, 0),
  at('e', 1, 0),
  at('ne', 1, -1),
  at('nw', 0, -1),
  at('w', -1, 0),
  at('sw', -1, 1),
  at('se', 0, 1),
  at('far', 2, -2),
];

describe('gridTabStop (roving tabindex)', () => {
  test('keeps the focused cell, then the selected cell, then the first cell in input order', () => {
    expect(gridTabStop(level, 'e', 'w')).toBe('e');
    expect(gridTabStop(level, 'removed', 'w')).toBe('w');
    expect(gridTabStop(level, null, null)).toBe('center');
    expect(gridTabStop(level, undefined, 'gone')).toBe('center');
    expect(gridTabStop([], 'e', 'w')).toBeNull();
  });

  test('default fallback: a spiral laid out centre-first starts at the centre, in both orientations', () => {
    const spiral = hexSpiral(hex(3, -1), 2).map((coord: HexCoord, i) => at(`s${i}`, coord.q, coord.r));
    for (const orientation of ORIENTATIONS) {
      expect(gridTabStop(spiral, null, null, { orientation })).toBe('s0');
      expect(gridTabStop(spiral, null, null, { orientation, fallback: 'input-order' })).toBe('s0');
    }
  });

  test("fallback 'reading-order' follows the reading order of the orientation", () => {
    const cells = [at('c', 0, 0), at('a', 1, -1), at('b', -1, 0)];
    expect(gridTabStop(cells, null, null)).toBe('c');
    expect(gridTabStop(cells, null, null, { fallback: 'reading-order' })).toBe('a');
    expect(gridTabStop(cells, null, null, { orientation: 'pointy', fallback: 'reading-order' })).toBe('a');
    expect(gridTabStop(cells, null, null, { orientation: 'flat', fallback: 'reading-order' })).toBe('b');
    expect(gridTabStop(level, null, null, { fallback: 'reading-order' })).toBe('far');
  });

  test('initialId comes after the focused and selected cell and before the fallback', () => {
    expect(gridTabStop(level, null, null, { initialId: 'sw' })).toBe('sw');
    expect(gridTabStop(level, 'e', null, { initialId: 'sw' })).toBe('e');
    expect(gridTabStop(level, 'gone', 'w', { initialId: 'sw' })).toBe('w');
    expect(gridTabStop(level, null, null, { initialId: 'gone' })).toBe('center');
    expect(gridTabStop(level, null, null, { initialId: 'gone', fallback: 'reading-order' })).toBe('far');
    expect(gridTabStop(level, null, null, { initialId: null })).toBe('center');
    const swDisabled = level.map((c) => (c.id === 'sw' ? { ...c, disabled: true } : c));
    expect(gridTabStop(swDisabled, null, null, { initialId: 'sw', isDisabled })).toBe('center');
  });

  test('disabled cells never hold the tab stop', () => {
    const cells = level.map((c) => (c.id === 'e' || c.id === 'far' ? { ...c, disabled: true } : c));
    expect(gridTabStop(cells, 'e', 'w', { isDisabled })).toBe('w');
    expect(gridTabStop(cells, 'e', 'far', { isDisabled })).toBe('center');
    expect(gridTabStop(cells, 'e', 'far', { isDisabled, fallback: 'reading-order' })).toBe('nw');
    const centerDisabled = level.map((c) => (c.id === 'center' ? { ...c, disabled: true } : c));
    expect(gridTabStop(centerDisabled, null, null, { isDisabled })).toBe('e');
    expect(gridTabStop(cells.map((c) => ({ ...c, disabled: true })), 'e', 'w', { isDisabled })).toBeNull();
    expect(gridTabStop(cells.map((c) => ({ ...c, disabled: true })), null, null, { isDisabled, fallback: 'reading-order' })).toBeNull();
  });

  test('focusableCells keeps input order', () => {
    expect(focusableCells([at('x', 0, 0, true), at('y', 1, 0), at('z', 2, 0)], isDisabled).map((c) => c.id)).toEqual(['y', 'z']);
    expect(focusableCells(level)).toHaveLength(level.length);
  });
});

describe('gridMove', () => {
  test('steps to the enabled neighbor and reports the direction taken', () => {
    const ids: Record<string, string> = { E: 'e', NE: 'ne', NW: 'nw', W: 'w', SW: 'sw', SE: 'se' };
    for (const direction of HEX_DIRECTIONS) {
      expect(gridMove(level, 'center', { direction })).toEqual({ id: ids[direction]!, direction });
    }
  });

  test('the fallback is used only when the main slot is empty or disabled, and reported as taken', () => {
    const up = { direction: 'NW', fallback: 'NE' } as const;
    expect(gridMove(level, 'center', up)).toEqual({ id: 'nw', direction: 'NW' });
    const noNw = level.filter((c) => c.id !== 'nw');
    expect(gridMove(noNw, 'center', up)).toEqual({ id: 'ne', direction: 'NE' });
    const nwDisabled = level.map((c) => (c.id === 'nw' ? { ...c, disabled: true } : c));
    expect(gridMove(nwDisabled, 'center', up, { isDisabled })).toEqual({ id: 'ne', direction: 'NE' });
    expect(gridMove(level, 'center', { direction: 'NW', fallback: undefined })).toEqual({ id: 'nw', direction: 'NW' });
  });

  test('never jumps a gap', () => {
    // 'far' sits two steps NE of the centre; with 'ne' gone the NE slot is a dead end.
    const gapped = level.filter((c) => c.id !== 'ne');
    expect(gridMove(gapped, 'center', { direction: 'NE' })).toBeNull();
    expect(gridMove(gapped.filter((c) => c.id !== 'e'), 'center', { direction: 'NE', fallback: 'E' })).toBeNull();
    const neDisabled = level.map((c) => (c.id === 'ne' ? { ...c, disabled: true } : c));
    expect(gridMove(neDisabled, 'center', { direction: 'NE' }, { isDisabled })).toBeNull();
  });

  test('unknown or disabled current cell: null', () => {
    expect(gridMove(level, 'missing', { direction: 'E' })).toBeNull();
    expect(gridMove(level, null, { direction: 'E' })).toBeNull();
    expect(gridMove(level, undefined, { direction: 'E' })).toBeNull();
    const centerDisabled = level.map((c) => (c.id === 'center' ? { ...c, disabled: true } : c));
    expect(gridMove(centerDisabled, 'center', { direction: 'E', fallback: 'NE' }, { isDisabled })).toBeNull();
  });

  test('accepts a move intent from keyIntent as is', () => {
    const intent = keyIntent({ key: 'ArrowUp', code: 'ArrowUp' });
    if (intent?.type !== 'move') throw new Error('expected a move');
    expect(gridMove(level.filter((c) => c.id !== 'nw'), 'center', intent)).toEqual({ id: 'ne', direction: 'NE' });
  });
});

describe('gridAction', () => {
  test('null intent stays null', () => {
    expect(gridAction(null, level, 'center')).toBeNull();
  });

  test('move focuses the existing neighbor and reports the direction taken', () => {
    const ids: Record<string, string> = { E: 'e', NE: 'ne', NW: 'nw', W: 'w', SW: 'sw', SE: 'se' };
    for (const direction of HEX_DIRECTIONS) {
      expect(gridAction({ type: 'move', direction }, level, 'center')).toEqual({ type: 'focus', id: ids[direction]!, direction });
    }
  });

  test('move into an empty slot does nothing and never jumps over the gap', () => {
    expect(gridAction({ type: 'move', direction: 'E' }, level, 'e')).toBeNull();
    expect(gridAction({ type: 'move', direction: 'NE' }, level, 'center')).toEqual({ type: 'focus', id: 'ne', direction: 'NE' });
    expect(gridAction({ type: 'move', direction: 'NE' }, level, 'ne')).toEqual({ type: 'focus', id: 'far', direction: 'NE' });
    const gapped = level.filter((c) => c.id !== 'ne');
    expect(gridAction({ type: 'move', direction: 'NE' }, gapped, 'center')).toBeNull();
  });

  test('a tied move tries its fallback only when the primary slot is empty or disabled', () => {
    const up = { type: 'move', direction: 'NW', fallback: 'NE' } as const;
    expect(gridAction(up, level, 'center')).toEqual({ type: 'focus', id: 'nw', direction: 'NW' });
    const noNw = level.filter((c) => c.id !== 'nw');
    expect(gridAction(up, noNw, 'center')).toEqual({ type: 'focus', id: 'ne', direction: 'NE' });
    const nwDisabled = level.map((c) => (c.id === 'nw' ? { ...c, disabled: true } : c));
    expect(gridAction(up, nwDisabled, 'center', { isDisabled })).toEqual({ type: 'focus', id: 'ne', direction: 'NE' });
    // Both slots empty, or the fallback disabled: nothing, and never a jump over the gap to 'far'.
    expect(gridAction(up, noNw.filter((c) => c.id !== 'ne'), 'center')).toBeNull();
    expect(gridAction(up, noNw.map((c) => (c.id === 'ne' ? { ...c, disabled: true } : c)), 'center', { isDisabled })).toBeNull();
    // Without a fallback an empty slot stays a dead end.
    expect(gridAction({ type: 'move', direction: 'NW' }, noNw, 'center')).toBeNull();
  });

  test('gridAction moves agree with gridMove', () => {
    const cells = level.filter((c) => c.id !== 'nw' && c.id !== 'se');
    for (const from of cells) {
      for (const direction of HEX_DIRECTIONS) {
        for (const fallback of [undefined, ...HEX_DIRECTIONS]) {
          const move = fallback === undefined ? { direction } : { direction, fallback };
          const step = gridMove(cells, from.id, move);
          expect(gridAction({ type: 'move', ...move }, cells, from.id)).toEqual(step && { type: 'focus', ...step });
        }
      }
    }
  });

  test('disabled cells are never focused or activated', () => {
    const cells = level.map((c) => (c.id === 'e' ? { ...c, disabled: true } : c));
    expect(gridAction({ type: 'move', direction: 'E' }, cells, 'center', { isDisabled })).toBeNull();
    expect(gridAction({ type: 'activate' }, cells, 'center', { isDisabled })).toEqual({ type: 'activate', id: 'center' });
    for (const orientation of ORIENTATIONS) {
      const actions = HEX_DIRECTIONS.map((direction) => gridAction({ type: 'move', direction }, cells, 'center', { isDisabled, orientation }));
      expect(actions).not.toContainEqual(expect.objectContaining({ id: 'e' }));
      expect(actions.filter((a) => a !== null)).toHaveLength(5);
    }
  });

  test("a disabled current cell yields nothing but 'up'", () => {
    const cells = level.map((c) => (c.id === 'center' ? { ...c, disabled: true } : c));
    const intents = [
      { type: 'move', direction: 'E' },
      { type: 'move', direction: 'NW', fallback: 'NE' },
      { type: 'first' },
      { type: 'last' },
      { type: 'activate' },
    ] as const;
    for (const orientation of ORIENTATIONS) {
      for (const intent of intents) expect({ intent, action: gridAction(intent, cells, 'center', { isDisabled, orientation }) }).toEqual({ intent, action: null });
    }
    expect(gridAction({ type: 'up' }, cells, 'center', { isDisabled })).toEqual({ type: 'up' });
  });

  test('unknown current cell (null, undefined, removed): Home/End still work, no move, no activate', () => {
    for (const current of ['missing', null, undefined]) {
      expect(gridAction({ type: 'move', direction: 'E' }, level, current)).toBeNull();
      expect(gridAction({ type: 'move', direction: 'NW', fallback: 'NE' }, level, current)).toBeNull();
      expect(gridAction({ type: 'activate' }, level, current)).toBeNull();
      expect(gridAction({ type: 'first' }, level, current)).toEqual({ type: 'focus', id: 'far' });
      expect(gridAction({ type: 'last' }, level, current)).toEqual({ type: 'focus', id: 'se' });
      expect(gridAction({ type: 'up' }, level, current)).toEqual({ type: 'up' });
    }
  });

  test('Home / End go to the first / last enabled cell in reading order, without a direction', () => {
    expect(gridAction({ type: 'first' }, level, 'center')).toEqual({ type: 'focus', id: 'far' });
    expect(gridAction({ type: 'last' }, level, 'center')).toEqual({ type: 'focus', id: 'se' });
    expect(gridAction({ type: 'first' }, level, 'center', { orientation: 'flat' })).toEqual({ type: 'focus', id: 'nw' });
    expect(gridAction({ type: 'last' }, level, 'center', { orientation: 'flat' })).toEqual({ type: 'focus', id: 'se' });
    const cells = level.map((c) => (c.id === 'far' || c.id === 'se' ? { ...c, disabled: true } : c));
    expect(gridAction({ type: 'first' }, cells, 'center', { isDisabled })).toEqual({ type: 'focus', id: 'nw' });
    expect(gridAction({ type: 'last' }, cells, 'center', { isDisabled })).toEqual({ type: 'focus', id: 'sw' });
    expect(gridAction({ type: 'first' }, [], null)).toBeNull();
    expect(gridAction({ type: 'last' }, cells.map((c) => ({ ...c, disabled: true })), 'missing', { isDisabled })).toBeNull();
    const home = gridAction({ type: 'first' }, level, 'center');
    expect(home?.type === 'focus' && 'direction' in home).toBe(false);
  });

  test("'up' passes through", () => {
    expect(gridAction({ type: 'up' }, level, 'center')).toEqual({ type: 'up' });
    expect(gridAction({ type: 'up' }, [], null)).toEqual({ type: 'up' });
  });
});

describe('keyIntent + gridAction together', () => {
  const spiral: TestCell[] = hexSpiral(hex(0, 0), 2).map((coord: HexCoord) => ({ id: `${coord.q},${coord.r}`, coord }));
  const press = (e: KeyEventLike, current: string, orientation: GridOrientation) =>
    gridAction(keyIntent(e, { orientation, keymap: { ...DEFAULT_KEYMAP, ...UP_LEVEL_KEYS } }), spiral, current, { orientation });

  test('arrows move to the cell that lies that way on screen', () => {
    // pointy: right = E (1,0); up = NW (0,-1). flat: up = NW (0,-1); down = SE (0,1); right = NE (1,-1).
    expect(press({ key: 'ArrowRight', code: 'ArrowRight' }, '0,0', 'pointy')).toEqual({ type: 'focus', id: '1,0', direction: 'E' });
    expect(press({ key: 'ArrowUp', code: 'ArrowUp' }, '0,0', 'pointy')).toEqual({ type: 'focus', id: '0,-1', direction: 'NW' });
    expect(press({ key: 'ArrowUp', code: 'ArrowUp' }, '0,0', 'flat')).toEqual({ type: 'focus', id: '0,-1', direction: 'NW' });
    expect(press({ key: 'ArrowDown', code: 'ArrowDown' }, '0,0', 'flat')).toEqual({ type: 'focus', id: '0,1', direction: 'SE' });
    expect(press({ key: 'ArrowRight', code: 'ArrowRight' }, '0,0', 'flat')).toEqual({ type: 'focus', id: '1,-1', direction: 'NE' });
  });

  test('every move key followed by its opposite returns to the start cell, in both orientations', () => {
    const pairs = [
      ['ArrowUp', 'ArrowDown'],
      ['ArrowLeft', 'ArrowRight'],
      ['KeyQ', 'KeyC'],
      ['KeyE', 'KeyZ'],
      ['KeyW', 'KeyX'],
      ['KeyA', 'KeyD'],
    ] as const;
    const keyOf = (code: string): KeyEventLike => ({ code, key: code.startsWith('Key') ? code.slice(3).toLowerCase() : code });
    for (const orientation of ORIENTATIONS) {
      for (const [a, b] of pairs) {
        for (const [first, back] of [[a, b], [b, a]] as const) {
          const there = press(keyOf(first), '0,0', orientation);
          if (there?.type !== 'focus' || there.direction === undefined) throw new Error(`${orientation} ${first}: expected a move`);
          expect(press(keyOf(back), there.id, orientation)).toEqual({ type: 'focus', id: '0,0', direction: oppositeDirection(there.direction) });
        }
      }
    }
  });

  test('arrow keys alone reach every neighbor, and the opposite arrow leads back, in both orientations', () => {
    const OPPOSITE: Record<string, string> = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' };
    for (const orientation of ORIENTATIONS) {
      for (const direction of HEX_DIRECTIONS) {
        const n = hexNeighbor(hex(0, 0), direction);
        const pair: TestCell[] = [at('origin', 0, 0), at('n', n.q, n.r)];
        const arrow = (key: string, current: string) => gridAction(keyIntent({ key, code: key }, { orientation }), pair, current, { orientation });
        const there = Object.keys(OPPOSITE).filter((key) => arrow(key, 'origin')?.type === 'focus');
        expect({ orientation, direction, reachable: there.length > 0 }).toEqual({ orientation, direction, reachable: true });
        for (const key of there) {
          expect(arrow(key, 'origin')).toEqual({ type: 'focus', id: 'n', direction });
          expect(arrow(OPPOSITE[key]!, 'n')).toEqual({ type: 'focus', id: 'origin', direction: oppositeDirection(direction) });
        }
      }
    }
  });

  test('a move through the fallback is not always undone by the opposite key', () => {
    // pointy: ArrowUp from a goes NE because NW is empty; ArrowDown from b prefers SE, which is filled.
    const cells = [at('a', 0, 0), at('b', 1, -1), at('c', 1, 0)];
    const arrow = (key: string, current: string) => gridAction(keyIntent({ key, code: key }), cells, current);
    expect(arrow('ArrowUp', 'a')).toEqual({ type: 'focus', id: 'b', direction: 'NE' });
    expect(arrow('ArrowDown', 'b')).toEqual({ type: 'focus', id: 'c', direction: 'SE' });
  });

  test('Enter activates, opt-in Escape goes up, Ctrl+Arrow does nothing', () => {
    expect(press({ key: 'Enter', code: 'Enter' }, '1,0', 'flat')).toEqual({ type: 'activate', id: '1,0' });
    expect(press({ key: 'Escape', code: 'Escape' }, '1,0', 'pointy')).toEqual({ type: 'up' });
    expect(press({ key: 'ArrowUp', code: 'ArrowUp', ctrlKey: true }, '0,0', 'pointy')).toBeNull();
  });
});
