import { describe, expect, test } from 'bun:test';
import { oppositeDirection, type HexDirection } from '../src/core';
import {
  DEFAULT_KEYMAP,
  UP_LEVEL_KEYS,
  directionAngle,
  keyIntent,
  lookupBinding,
  type GridOrientation,
  type KeyEventLike,
  type Keymap,
  type NearestDirections,
} from '../src/grid';

/** A physical key as a browser reports it on a US layout. */
interface Key {
  readonly key: string;
  readonly code: string;
  readonly angle: number;
}

const MOVE_KEYS: readonly Key[] = [
  { key: 'ArrowRight', code: 'ArrowRight', angle: 0 },
  { key: 'ArrowUp', code: 'ArrowUp', angle: 90 },
  { key: 'ArrowLeft', code: 'ArrowLeft', angle: 180 },
  { key: 'ArrowDown', code: 'ArrowDown', angle: 270 },
  { key: 'q', code: 'KeyQ', angle: 135 },
  { key: 'w', code: 'KeyW', angle: 90 },
  { key: 'e', code: 'KeyE', angle: 45 },
  { key: 'a', code: 'KeyA', angle: 180 },
  { key: 'd', code: 'KeyD', angle: 0 },
  { key: 'z', code: 'KeyZ', angle: 225 },
  { key: 'x', code: 'KeyX', angle: 270 },
  { key: 'c', code: 'KeyC', angle: 315 },
];

/** A move without a tie, or a tie: counter-clockwise direction first, clockwise fallback second. */
const to = (direction: HexDirection, fallback?: HexDirection): NearestDirections => (fallback ? { direction, fallback } : { direction });

/** Expected move for every key. Ties carry a fallback. */
const EXPECTED: Record<GridOrientation, Record<string, NearestDirections>> = {
  pointy: {
    ArrowRight: to('E'),
    ArrowUp: to('NW', 'NE'),
    ArrowLeft: to('W'),
    ArrowDown: to('SE', 'SW'),
    KeyQ: to('NW'),
    KeyW: to('NW', 'NE'),
    KeyE: to('NE'),
    KeyA: to('W'),
    KeyD: to('E'),
    KeyZ: to('SW'),
    KeyX: to('SE', 'SW'),
    KeyC: to('SE'),
  },
  flat: {
    ArrowRight: to('NE', 'E'),
    ArrowUp: to('NW'),
    ArrowLeft: to('SW', 'W'),
    ArrowDown: to('SE'),
    KeyQ: to('W'),
    KeyW: to('NW'),
    KeyE: to('NE'),
    KeyA: to('SW', 'W'),
    KeyD: to('NE', 'E'),
    KeyZ: to('SW'),
    KeyX: to('SE'),
    KeyC: to('E'),
  },
};

const ORIENTATIONS: readonly GridOrientation[] = ['pointy', 'flat'];
const angularDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
};
const ev = (k: Pick<Key, 'key' | 'code'>, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({ key: k.key, code: k.code, ...mods });

const NAMED: readonly Pick<Key, 'key' | 'code'>[] = [
  { key: 'Home', code: 'Home' },
  { key: 'End', code: 'End' },
  { key: 'Enter', code: 'Enter' },
  { key: ' ', code: 'Space' },
];
const ALL_BOUND = [...MOVE_KEYS, ...NAMED];

describe('keyIntent: moves by screen angle', () => {
  for (const orientation of ORIENTATIONS) {
    test(`every move key in ${orientation} orientation`, () => {
      for (const k of MOVE_KEYS) {
        expect({ code: k.code, intent: keyIntent(ev(k), { orientation }) }).toEqual({
          code: k.code,
          intent: { type: 'move', ...EXPECTED[orientation][k.code]! },
        });
      }
    });

    test(`every move key lands on a nearest direction in ${orientation} orientation`, () => {
      for (const k of MOVE_KEYS) {
        const intent = keyIntent(ev(k), { orientation });
        if (intent?.type !== 'move') throw new Error(`${k.code}: expected a move`);
        const distance = angularDistance(directionAngle(intent.direction, orientation), k.angle);
        expect(distance).toBeLessThanOrEqual(30);
        if (intent.fallback === undefined) {
          expect(distance).toBeLessThan(30);
        } else {
          // A tie: both candidates sit exactly 30° away, the fallback clockwise of the key.
          expect(distance).toBe(30);
          expect(angularDistance(directionAngle(intent.fallback, orientation), k.angle)).toBe(30);
          expect(directionAngle(intent.fallback, orientation)).toBe((k.angle + 330) % 360);
        }
      }
    });

    test(`arrow keys cover all six directions, counting fallbacks, in ${orientation} orientation`, () => {
      const reached = new Set<HexDirection>();
      for (const code of ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown']) {
        const { direction, fallback } = EXPECTED[orientation][code]!;
        reached.add(direction);
        if (fallback) reached.add(fallback);
      }
      expect(reached.size).toBe(6);
    });

    test(`opposite keys give opposite directions in ${orientation} orientation`, () => {
      const pairs = [
        ['ArrowUp', 'ArrowDown'],
        ['ArrowLeft', 'ArrowRight'],
        ['KeyQ', 'KeyC'],
        ['KeyE', 'KeyZ'],
        ['KeyW', 'KeyX'],
        ['KeyA', 'KeyD'],
      ] as const;
      for (const [a, b] of pairs) {
        const { direction, fallback } = EXPECTED[orientation][a]!;
        expect(EXPECTED[orientation][b]).toEqual(to(oppositeDirection(direction), fallback && oppositeDirection(fallback)));
      }
    });
  }

  test('letter cluster covers all six directions without ties where its keys sit on hex angles', () => {
    const pointy = ['KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyZ', 'KeyC'].map((c) => EXPECTED.pointy[c]!);
    const flat = ['KeyQ', 'KeyW', 'KeyE', 'KeyZ', 'KeyX', 'KeyC'].map((c) => EXPECTED.flat[c]!);
    for (const move of [...pointy, ...flat]) expect(move.fallback).toBeUndefined();
    expect(new Set(pointy.map((m) => m.direction)).size).toBe(6);
    expect(new Set(flat.map((m) => m.direction)).size).toBe(6);
  });

  test('orientation defaults to pointy', () => {
    expect(keyIntent({ key: 'ArrowUp', code: 'ArrowUp' })).toEqual({ type: 'move', direction: 'NW', fallback: 'NE' });
  });
});

describe('keyIntent: Home, End, Enter, Space', () => {
  for (const orientation of ORIENTATIONS) {
    test(`named keys in ${orientation} orientation`, () => {
      expect(keyIntent({ key: 'Home', code: 'Home' }, { orientation })).toEqual({ type: 'first' });
      expect(keyIntent({ key: 'End', code: 'End' }, { orientation })).toEqual({ type: 'last' });
      expect(keyIntent({ key: 'Enter', code: 'Enter' }, { orientation })).toEqual({ type: 'activate' });
      expect(keyIntent({ key: ' ', code: 'Space' }, { orientation })).toEqual({ type: 'activate' });
    });
  }

  test('numpad variants match by key', () => {
    expect(keyIntent({ key: 'Enter', code: 'NumpadEnter' })).toEqual({ type: 'activate' });
    expect(keyIntent({ key: 'ArrowUp', code: 'Numpad8' })).toEqual({ type: 'move', direction: 'NW', fallback: 'NE' });
    expect(keyIntent({ key: 'Home', code: 'Numpad7' })).toEqual({ type: 'first' });
    expect(keyIntent({ key: '8', code: 'Numpad8' })).toBeNull();
  });
});

describe('keyIntent: modifiers and composition pass through', () => {
  const MODIFIERS: ReadonlyArray<Partial<KeyEventLike>> = [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }, { isComposing: true }];

  test('every bound key returns null with Ctrl, Meta, Alt, Shift or during composition', () => {
    for (const orientation of ORIENTATIONS) {
      for (const k of ALL_BOUND) {
        for (const mod of MODIFIERS) {
          expect({ k: k.code, mod, intent: keyIntent(ev(k, mod), { orientation }) }).toEqual({ k: k.code, mod, intent: null });
        }
      }
    }
  });

  test('common shortcuts are left to the browser', () => {
    expect(keyIntent({ key: 'c', code: 'KeyC', ctrlKey: true })).toBeNull(); // copy
    expect(keyIntent({ key: 'a', code: 'KeyA', metaKey: true })).toBeNull(); // select all
    expect(keyIntent({ key: 'z', code: 'KeyZ', ctrlKey: true })).toBeNull(); // undo
    expect(keyIntent({ key: 'd', code: 'KeyD', metaKey: true })).toBeNull(); // bookmark
    expect(keyIntent({ key: 'e', code: 'KeyE', ctrlKey: true })).toBeNull(); // search bar
    expect(keyIntent({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true })).toBeNull(); // history back
    expect(keyIntent({ key: 'Tab', code: 'Tab', shiftKey: true })).toBeNull();
    expect(keyIntent({ key: 'Q', code: 'KeyQ', shiftKey: true })).toBeNull(); // shifted letter is not a move
    expect(keyIntent({ key: 'ArrowUp', code: 'ArrowUp', shiftKey: true })).toBeNull();
    expect(keyIntent({ key: 'Process', code: 'KeyQ', isComposing: true })).toBeNull();
  });

  test("key 'Process' (IME) and 'Dead' (dead key) return null on every bound physical key", () => {
    // The first keydown of an IME composition reports key 'Process' with isComposing still false.
    for (const orientation of ORIENTATIONS) {
      for (const k of ALL_BOUND) {
        for (const key of ['Process', 'Dead']) {
          expect({ code: k.code, key, intent: keyIntent({ key, code: k.code }, { orientation }) }).toEqual({ code: k.code, key, intent: null });
        }
      }
    }
    expect(keyIntent({ key: 'Process' })).toBeNull();
    expect(keyIntent({ key: 'Dead', code: 'Quote' })).toBeNull();
  });

  test("a keymap entry cannot bind 'Process' or 'Dead'", () => {
    const keymap: Keymap = { ...DEFAULT_KEYMAP, Process: { type: 'activate' }, Dead: { type: 'first' } };
    expect(keyIntent({ key: 'Process', code: '' }, { keymap })).toBeNull();
    expect(keyIntent({ key: 'Dead', code: 'BracketLeft' }, { keymap })).toBeNull();
    expect(keyIntent({ key: 'Enter', code: 'Enter' }, { keymap })).toEqual({ type: 'activate' });
  });

  test('lookupBinding does no filtering; keyIntent does', () => {
    expect(lookupBinding({ key: 'Process', code: 'KeyQ' })).toEqual({ type: 'move', angle: 135 });
    expect(lookupBinding({ key: 'q', code: 'KeyQ', ctrlKey: true })).toEqual({ type: 'move', angle: 135 });
  });

  test('explicit false modifiers do not block', () => {
    const all = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false };
    expect(keyIntent({ key: 'ArrowLeft', code: 'ArrowLeft', ...all })).toEqual({ type: 'move', direction: 'W' });
  });
});

describe('keyIntent: unbound keys and key tables', () => {
  test('unbound keys return null', () => {
    for (const k of [
      { key: 'Tab', code: 'Tab' },
      { key: 's', code: 'KeyS' },
      { key: 'F5', code: 'F5' },
      { key: 'PageDown', code: 'PageDown' },
      { key: 'Unidentified', code: '' },
      { key: 'Dead', code: 'Quote' },
      { key: 'ö', code: 'Semicolon' },
    ]) {
      expect(keyIntent(k)).toBeNull();
    }
  });

  test("'up' is opt-in: Escape and Backspace do nothing by default", () => {
    expect(keyIntent({ key: 'Escape', code: 'Escape' })).toBeNull();
    expect(keyIntent({ key: 'Backspace', code: 'Backspace' })).toBeNull();
    const keymap: Keymap = { ...DEFAULT_KEYMAP, ...UP_LEVEL_KEYS };
    expect(keyIntent({ key: 'Escape', code: 'Escape' }, { keymap })).toEqual({ type: 'up' });
    expect(keyIntent({ key: 'Backspace', code: 'Backspace' }, { keymap })).toEqual({ type: 'up' });
    expect(keyIntent({ key: 'Escape', code: 'Escape', shiftKey: true }, { keymap })).toBeNull();
    expect(keyIntent({ key: 'ArrowRight', code: 'ArrowRight' }, { keymap, orientation: 'flat' })).toEqual({ type: 'move', direction: 'NE', fallback: 'E' });
  });

  test('a custom keymap replaces the default', () => {
    const keymap: Keymap = { Escape: { type: 'up' }, KeyS: { type: 'activate' }, KeyL: { type: 'move', angle: 100 } };
    expect(keyIntent({ key: 'ArrowUp', code: 'ArrowUp' }, { keymap })).toBeNull();
    expect(keyIntent({ key: 's', code: 'KeyS' }, { keymap })).toEqual({ type: 'activate' });
    expect(keyIntent({ key: 'l', code: 'KeyL' }, { keymap })).toEqual({ type: 'move', direction: 'NW' });
    expect(keyIntent({ key: 'l', code: 'KeyL' }, { keymap, orientation: 'flat' })).toEqual({ type: 'move', direction: 'NW' });
  });

  test('entries may name a key instead of a code; the code wins when both match', () => {
    const keymap: Keymap = { '+': { type: 'activate' }, KeyQ: { type: 'first' }, a: { type: 'last' } };
    expect(keyIntent({ key: '+', code: 'NumpadAdd' }, { keymap })).toEqual({ type: 'activate' });
    expect(keyIntent({ key: 'a', code: 'KeyQ' }, { keymap })).toEqual({ type: 'first' });
    expect(keyIntent({ key: 'a', code: 'KeyA' }, { keymap })).toEqual({ type: 'last' });
  });

  test('a binding with a non-finite angle is a programming error', () => {
    expect(() => keyIntent({ key: 'x', code: 'KeyX' }, { keymap: { KeyX: { type: 'move', angle: Number.NaN } } })).toThrow(RangeError);
  });

  test('inherited object properties are never bindings', () => {
    expect(keyIntent({ key: 'constructor', code: 'toString' })).toBeNull();
    expect(lookupBinding({ key: '__proto__' })).toBeUndefined();
  });

  test('default tables are frozen', () => {
    expect(Object.isFrozen(DEFAULT_KEYMAP)).toBe(true);
    expect(Object.isFrozen(UP_LEVEL_KEYS)).toBe(true);
    expect(Object.isFrozen(DEFAULT_KEYMAP['ArrowUp'])).toBe(true);
  });
});

describe('keyIntent: keyboard layouts', () => {
  test('letters match by physical key when the event has a code', () => {
    // AZERTY: the key printing 'a' sits where QWERTY has Q.
    expect(keyIntent({ key: 'a', code: 'KeyQ' })).toEqual({ type: 'move', direction: 'NW' });
    // QWERTZ: bottom-left prints 'y' (code KeyZ); the top-row 'z' (code KeyY) is unbound.
    expect(keyIntent({ key: 'y', code: 'KeyZ' })).toEqual({ type: 'move', direction: 'SW' });
    expect(keyIntent({ key: 'z', code: 'KeyY' })).toBeNull();
    // Caps Lock is not Shift.
    expect(keyIntent({ key: 'E', code: 'KeyE' })).toEqual({ type: 'move', direction: 'NE' });
  });

  test('a code match ignores the printed character, whatever the layout', () => {
    // Cyrillic ЙЦУКЕН: KeyQ prints 'й', KeyE prints 'у'. Still the Q and E moves, on purpose;
    // this is why the handler belongs on grid cells, not on a host that contains text inputs.
    expect(keyIntent({ key: 'й', code: 'KeyQ' })).toEqual({ type: 'move', direction: 'NW' });
    expect(keyIntent({ key: 'у', code: 'KeyE' })).toEqual({ type: 'move', direction: 'NE' });
    // AZERTY: the key printing 'q' sits where QWERTY has A, so it is the A move (W).
    expect(keyIntent({ key: 'q', code: 'KeyA' })).toEqual({ type: 'move', direction: 'W' });
  });

  test('events without a code fall back to the US layout', () => {
    expect(keyIntent({ key: 'q' })).toEqual({ type: 'move', direction: 'NW' });
    expect(keyIntent({ key: 'C' }, { orientation: 'flat' })).toEqual({ type: 'move', direction: 'E' });
    expect(keyIntent({ key: ' ' })).toEqual({ type: 'activate' });
    expect(keyIntent({ key: 'ArrowDown' })).toEqual({ type: 'move', direction: 'SE', fallback: 'SW' });
    expect(keyIntent({ key: 'Home', code: '' })).toEqual({ type: 'first' });
    expect(keyIntent({ key: 'ö' })).toBeNull();
  });
});
