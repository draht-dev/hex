/**
 * Keyboard semantics for a hex grid as pure functions: a key event goes in, an intent comes out.
 * DOM-free: pass a `KeyboardEvent` or any object with the same fields.
 *
 * Contract for consumers: call `preventDefault()` if and only if `keyIntent` returns non-null,
 * whatever `gridAction` makes of the intent afterwards. Everything else (Tab, Shift+Tab,
 * Ctrl/Cmd shortcuts, Alt+Arrow history navigation, typing through an IME, dead keys) reaches
 * the browser untouched.
 *
 * Bind the handler on the grid cells (or on a grid container that holds nothing but cells), not
 * on a host that also contains text inputs: letter bindings match the physical key (`code`), so
 * the key that types 'q' on QWERTY or 'a' on AZERTY is a move whatever character it prints.
 */
import type { HexDirection } from '../core/hex';
import { nearestDirections, type GridOrientation } from './geometry';

/** The fields of a `KeyboardEvent` that `keyIntent` reads. */
export interface KeyEventLike {
  /** `KeyboardEvent.key`, e.g. 'ArrowUp', 'Enter', 'q'. */
  readonly key: string;
  /** `KeyboardEvent.code`, the physical key, e.g. 'KeyQ', 'Space'. Optional for synthetic events. */
  readonly code?: string | undefined;
  readonly ctrlKey?: boolean | undefined;
  readonly metaKey?: boolean | undefined;
  readonly altKey?: boolean | undefined;
  readonly shiftKey?: boolean | undefined;
  readonly isComposing?: boolean | undefined;
}

/** What a key is bound to. `move.angle` is the intended screen direction in degrees (0 right, 90 up). */
export type KeyBinding =
  | { readonly type: 'move'; readonly angle: number }
  | { readonly type: 'first' }
  | { readonly type: 'last' }
  | { readonly type: 'activate' }
  | { readonly type: 'up' };

/**
 * Key table. Entry names are `KeyboardEvent.code` values (physical key: 'KeyQ', 'Space',
 * 'ArrowUp') or `KeyboardEvent.key` values ('Enter', 'Escape'); `code` is tried first.
 * The default letter bindings use `code`, so they keep their shape on AZERTY or QWERTZ.
 */
export type Keymap = Readonly<Record<string, KeyBinding>>;

/**
 * What a key asks the grid to do. A move carries `fallback` only when the key angle lies exactly
 * between two hex directions (e.g. ArrowUp in pointy-top): `direction` is the counter-clockwise
 * one, `fallback` the clockwise one, tried by `gridAction` when the `direction` slot is empty or
 * disabled.
 */
export type KeyIntent =
  | { readonly type: 'move'; readonly direction: HexDirection; readonly fallback?: HexDirection }
  | { readonly type: 'first' }
  | { readonly type: 'last' }
  | { readonly type: 'activate' }
  | { readonly type: 'up' };

export interface KeyIntentOptions {
  /** Grid presentation; decides which hex direction a screen angle resolves to. Default 'pointy'. */
  readonly orientation?: GridOrientation | undefined;
  /** Replaces `DEFAULT_KEYMAP` entirely. Spread `DEFAULT_KEYMAP` to extend it. */
  readonly keymap?: Keymap | undefined;
}

const move = (angle: number): KeyBinding => Object.freeze({ type: 'move', angle });
const FIRST: KeyBinding = Object.freeze({ type: 'first' });
const LAST: KeyBinding = Object.freeze({ type: 'last' });
const ACTIVATE: KeyBinding = Object.freeze({ type: 'activate' });
const UP: KeyBinding = Object.freeze({ type: 'up' });

/**
 * Default bindings.
 * - Arrows: Right 0°, Up 90°, Left 180°, Down 270°.
 * - Letter cluster around S, at its keyboard-layout angles: Q 135°, W 90°, E 45°, A 180°,
 *   D 0°, Z 225°, X 270°, C 315° (S itself is unbound).
 * - Home / End: first / last focusable cell in reading order. Enter / Space: activate.
 * "Up a level" is not bound by default; add `UP_LEVEL_KEYS` if the grid has a parent level.
 */
export const DEFAULT_KEYMAP: Keymap = Object.freeze({
  ArrowRight: move(0),
  ArrowUp: move(90),
  ArrowLeft: move(180),
  ArrowDown: move(270),
  KeyQ: move(135),
  KeyW: move(90),
  KeyE: move(45),
  KeyA: move(180),
  KeyD: move(0),
  KeyZ: move(225),
  KeyX: move(270),
  KeyC: move(315),
  Home: FIRST,
  End: LAST,
  Enter: ACTIVATE,
  Space: ACTIVATE,
});

/** Opt-in "up a level" keys: `keymap: { ...DEFAULT_KEYMAP, ...UP_LEVEL_KEYS }`. */
export const UP_LEVEL_KEYS: Keymap = Object.freeze({
  Escape: UP,
  Backspace: UP,
});

/** US-layout `code` for a printable `key`, used only when an event carries no `code`. */
function codeFromKey(key: string): string | undefined {
  if (/^[a-z]$/i.test(key)) return `Key${key.toUpperCase()}`;
  if (/^[0-9]$/.test(key)) return `Digit${key}`;
  if (key === ' ') return 'Space';
  return undefined;
}

function binding(keymap: Keymap, name: string | undefined): KeyBinding | undefined {
  return name !== undefined && Object.hasOwn(keymap, name) ? keymap[name] : undefined;
}

/**
 * Find the binding for an event: by `code` (physical key) first, then by `key`.
 * Events without `code` (synthetic ones) use the US-layout code of a printable `key`
 * ('q' → 'KeyQ', ' ' → 'Space'). Inherited object properties never count as entries.
 *
 * A `code` match does not compare the printed `key` with the US-layout character on purpose:
 * on AZERTY 'KeyQ' prints 'a', on a Cyrillic layout 'й', and both must stay moves. This lookup
 * applies no modifier, IME or dead-key filtering; `keyIntent` does.
 */
export function lookupBinding(event: KeyEventLike, keymap: Keymap = DEFAULT_KEYMAP): KeyBinding | undefined {
  const code = event.code ? event.code : codeFromKey(event.key);
  return binding(keymap, code) ?? binding(keymap, event.key);
}

/**
 * Translate a keydown into a grid intent, or null if the grid must not handle it.
 *
 * Returns null (and the consumer must not call `preventDefault`) when:
 * - Ctrl, Meta (Cmd) or Alt is held: browser and OS shortcuts win;
 * - Shift is held: Shift+Tab and Shift+Arrow selection keep working, shifted letters are not moves;
 * - an IME composition is in progress (`isComposing`), or the key is 'Process' (an IME is
 *   handling it; the first keydown of a composition has `isComposing` false) or 'Dead' (a dead
 *   key starting an accented character), even when `code` or a custom keymap entry would bind it;
 * - the key is not in the keymap.
 *
 * Any non-null result means the grid owns the key, even if `gridAction` then finds nothing to do
 * (a move into an empty slot, Home in an empty grid): call `preventDefault` anyway.
 *
 * Move bindings resolve by screen angle: the hex direction nearest to the key's angle in the
 * given orientation. On a tie the move also carries the runner-up as `fallback` (see
 * `nearestDirections`).
 */
export function keyIntent(event: KeyEventLike, options: KeyIntentOptions = {}): KeyIntent | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.isComposing) return null;
  if (event.key === 'Process' || event.key === 'Dead') return null;
  const bound = lookupBinding(event, options.keymap ?? DEFAULT_KEYMAP);
  if (!bound) return null;
  if (bound.type === 'move') {
    return { type: 'move', ...nearestDirections(bound.angle, options.orientation ?? 'pointy') };
  }
  return { type: bound.type };
}
