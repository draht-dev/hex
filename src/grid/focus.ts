/**
 * Roving focus for a hex grid (one cell has tabindex 0, the rest -1) and resolution of key
 * intents against the actual cells. Pure: ids in, ids out; the consumer moves DOM focus.
 *
 * Disabled cells are never focus targets: they never become the tab stop, Home/End skip them,
 * moves never land on them, and they are never activated. A disabled current cell produces no
 * action at all (except 'up').
 */
import type { HexDirection } from '../core/hex';
import { gridNeighbor, readingOrder, type GridCell, type GridOrientation } from './geometry';
import type { KeyIntent } from './keyboard';

export interface FocusOptions<T> {
  /** Reading order for Home/End and for the 'reading-order' tab-stop fallback. Default 'pointy'. */
  readonly orientation?: GridOrientation | undefined;
  /** Disabled cells are skipped. Default: no cell is disabled. */
  readonly isDisabled?: ((cell: T) => boolean) | undefined;
}

/** Which enabled cell `gridTabStop` falls back to when no preferred id qualifies. */
export type TabStopFallback = 'input-order' | 'reading-order';

export interface TabStopOptions<T> extends FocusOptions<T> {
  /** Tab stop when neither the focused nor the selected cell qualifies (e.g. a level's hub cell). */
  readonly initialId?: string | null | undefined;
  /**
   * Last resort: the first enabled cell in input order ('input-order', the default; a spiral
   * laid out centre-first starts at the centre) or in reading order of `orientation`
   * ('reading-order', the top-left cell).
   */
  readonly fallback?: TabStopFallback | undefined;
}

/** A move resolved against the grid: the target cell and the direction actually taken. */
export interface GridMoveResult {
  readonly id: string;
  /** The intent's `direction`, or its `fallback` when the primary slot was empty or disabled. */
  readonly direction: HexDirection;
}

/** What the consumer should do after a key intent was resolved against the grid. */
export type GridAction =
  | {
      readonly type: 'focus';
      readonly id: string;
      /** Present only for moves: the direction actually taken (see `gridMove`). Absent for Home/End. */
      readonly direction?: HexDirection;
    }
  | { readonly type: 'activate'; readonly id: string }
  | { readonly type: 'up' };

const NONE_DISABLED = (): boolean => false;

/** Enabled cells, input order kept. */
export function focusableCells<T extends GridCell>(cells: readonly T[], isDisabled: (cell: T) => boolean = NONE_DISABLED): T[] {
  return cells.filter((cell) => !isDisabled(cell));
}

/**
 * The cell that carries tabindex 0 (roving tabindex). The first of these that is present and
 * enabled wins:
 * 1. `focusedId`;
 * 2. `selectedId`;
 * 3. `options.initialId`;
 * 4. the first enabled cell in input order (default) or, with `fallback: 'reading-order'`, in
 *    reading order of `options.orientation`.
 * null only when no cell is enabled. Removed or filtered cells never leave the grid without a
 * tab stop.
 */
export function gridTabStop<T extends GridCell>(
  cells: readonly T[],
  focusedId: string | null | undefined,
  selectedId: string | null | undefined,
  options: TabStopOptions<T> = {},
): string | null {
  const enabled = focusableCells(cells, options.isDisabled);
  for (const id of [focusedId, selectedId, options.initialId]) {
    if (id != null && enabled.some((cell) => cell.id === id)) return id;
  }
  const order = options.fallback === 'reading-order' ? readingOrder(enabled, options.orientation) : enabled;
  return order[0]?.id ?? null;
}

/**
 * Step from `currentId` one cell in `move.direction`. If that slot is empty or disabled and the
 * move has a `fallback` (a tied key angle, see `keyIntent`), step in `fallback` instead.
 * Returns the target id and the direction actually taken, or null when:
 * - `currentId` is unknown, or the current cell is disabled;
 * - both slots (or the only slot) are empty or disabled.
 * Never jumps over a gap: only the six adjacent slots are considered.
 */
export function gridMove<T extends GridCell>(
  cells: readonly T[],
  currentId: string | null | undefined,
  move: { readonly direction: HexDirection; readonly fallback?: HexDirection | undefined },
  options: Pick<FocusOptions<T>, 'isDisabled'> = {},
): GridMoveResult | null {
  const isDisabled = options.isDisabled ?? NONE_DISABLED;
  const current = findCell(cells, currentId);
  if (!current || isDisabled(current)) return null;
  const directions = move.fallback === undefined ? [move.direction] : [move.direction, move.fallback];
  for (const direction of directions) {
    const next = gridNeighbor(cells, current, direction);
    if (next && !isDisabled(next)) return { id: next.id, direction };
  }
  return null;
}

/**
 * Resolve a key intent (from `keyIntent`) against the grid, with focus on `currentId`.
 * - move: `{ type: 'focus', id, direction }` from `gridMove`, or null at a dead end. A move that
 *   used the fallback is not always undone by the opposite key: that key tries its own primary
 *   direction first;
 * - first / last: first / last enabled cell in reading order (no `direction`);
 * - activate: the current cell;
 * - up: always `{ type: 'up' }` (only produced when the keymap opts in).
 *
 * Current cell disabled: every intent except 'up' returns null.
 * Current cell unknown (null, undefined or not in `cells`, e.g. removed): first / last still
 * work, so Home/End lead back into the grid; move and activate return null.
 *
 * A null result does not mean the key was unhandled: whether to call `preventDefault` depends on
 * `keyIntent` alone.
 */
export function gridAction<T extends GridCell>(
  intent: KeyIntent | null,
  cells: readonly T[],
  currentId: string | null | undefined,
  options: FocusOptions<T> = {},
): GridAction | null {
  if (!intent) return null;
  if (intent.type === 'up') return { type: 'up' };
  const isDisabled = options.isDisabled ?? NONE_DISABLED;
  const current = findCell(cells, currentId);
  if (current && isDisabled(current)) return null;
  switch (intent.type) {
    case 'first':
    case 'last': {
      const order = readingOrder(focusableCells(cells, isDisabled), options.orientation);
      const target = intent.type === 'first' ? order[0] : order[order.length - 1];
      return target ? { type: 'focus', id: target.id } : null;
    }
    case 'activate':
      return current ? { type: 'activate', id: current.id } : null;
    case 'move': {
      const step = gridMove(cells, currentId, intent, { isDisabled });
      return step ? { type: 'focus', id: step.id, direction: step.direction } : null;
    }
  }
}

function findCell<T extends GridCell>(cells: readonly T[], id: string | null | undefined): T | undefined {
  return id == null ? undefined : cells.find((cell) => cell.id === id);
}
