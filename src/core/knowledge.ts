/**
 * Knowledge hive: levels, cells, links, navigation.
 * Three levels, top-down: University → Area → Person (student/teacher). Each level owns a hex
 * grid of cells; a Cell is one knowledge unit and connects to its grid neighbors.
 *
 * Structure only: titles and summaries are data supplied by a repository adapter. The package
 * builds no URLs: apps map levels to their own routes (via `handle`) and cell routes are data
 * (`CellTarget`).
 */

import {
  HEX_DIRECTIONS,
  HEX_ORIGIN,
  hexEquals,
  hexKey,
  hexNeighbor,
  type HexCoord,
  type HexDirection,
} from './hex';

export type CellId = string;
export type LevelId = string;

/** Hive levels, top-down. */
export type LevelKind = 'university' | 'area' | 'person';

export const LEVEL_KINDS: readonly LevelKind[] = ['university', 'area', 'person'] as const;

/** Person sub-role. */
export type PersonRole = 'student' | 'teacher';

export interface LevelRef {
  readonly kind: LevelKind;
  readonly id: LevelId;
}

/**
 * One page of the hive (university, area or person). Each level owns its own hex grid of cells.
 */
export interface Level {
  readonly ref: LevelRef;
  /** Display title (data, not copy). */
  readonly title: string;
  /** Slug for areas and persons (keep it unique per kind); see `findLevel`. Apps decide the URL shape. */
  readonly handle?: string;
  /** Parent level (person → area → university). University has none. */
  readonly parent?: LevelRef;
  /** Only for kind 'person'. */
  readonly personRole?: PersonRole;
  /** Coordinate of this level's root cell in its own grid (default origin). */
  readonly rootCoord?: HexCoord;
}

/**
 * What a cell is about. Closed set: the kind only labels a cell (renderers pick icon and style
 * from it); hive rules (`canAttach`, `navigate`, `neighborSlots`) treat all kinds alike, and
 * where activation leads is `Cell.target`. Repository adapters that read external data check
 * kinds at that boundary (`isCellKind`) and reject or map unknown ones there.
 */
export type CellKind =
  | 'topic'
  | 'lesson'
  | 'episode'
  | 'exercise'
  /** A whole course, usually with a route target to its start page. */
  | 'course'
  | 'link'
  /** Portal to another level (area/person page). */
  | 'level-portal';

/** Every `CellKind`, in declaration order. */
export const CELL_KINDS: readonly CellKind[] = ['topic', 'lesson', 'episode', 'exercise', 'course', 'link', 'level-portal'] as const;

/** Type guard for a `CellKind` coming from untyped data (JSON, CMS, database rows). */
export function isCellKind(value: unknown): value is CellKind {
  return typeof value === 'string' && (CELL_KINDS as readonly string[]).includes(value);
}

/** Where activating a cell leads. */
export type CellTarget =
  | { readonly type: 'route'; readonly path: string }
  | { readonly type: 'url'; readonly href: string }
  | { readonly type: 'level'; readonly level: LevelRef };

/** One knowledge unit (a honeycomb cell), placed on its level's grid. */
export interface Cell {
  readonly id: CellId;
  readonly level: LevelRef;
  /** Position in the level grid. Unique per level. */
  readonly coord: HexCoord;
  readonly kind: CellKind;
  readonly title: string;
  readonly summary?: string;
  readonly tags?: readonly string[];
  readonly target?: CellTarget;
  /** userId-like author reference (mock ids only). */
  readonly author?: string;
  /** Epoch ms, set by the use case from the Clock port. */
  readonly createdAtMs?: number;
}

/** Relation between cells beyond grid adjacency (grid adjacency is implicit, not stored). */
export type CellLinkKind = 'see-also' | 'prerequisite' | 'continues' | 'portal';

export interface CellLink {
  readonly from: CellId;
  readonly to: CellId;
  readonly kind: CellLinkKind;
}

/** One of the six slots around a cell: filled by a cell or empty (attach point). */
export interface NeighborSlot {
  readonly dir: HexDirection;
  readonly coord: HexCoord;
  readonly cell?: Cell;
}

/** Everything a hive page needs for one focused cell. */
export interface CellView {
  readonly level: Level;
  readonly cell: Cell;
  readonly neighbors: readonly NeighborSlot[];
  /** Explicit links (may cross levels). */
  readonly links: readonly CellLink[];
  /** Breadcrumb university → … → level. */
  readonly path: readonly LevelRef[];
}

/** Everything a hive page needs to show one whole level (grid page). */
export interface LevelView {
  readonly level: Level;
  /** All cells of the level, sorted by row then column (r, then q) for stable rendering. */
  readonly cells: readonly Cell[];
  /** Breadcrumb university → … → level (same as CellView.path). */
  readonly path: readonly LevelRef[];
  /** Parent level (undefined for the university). */
  readonly parent?: Level;
  /** Direct child levels (areas of the university, persons of an area). */
  readonly children: readonly Level[];
  /** Free slots where `HiveNavigator.attach` would succeed (root coord if the level is empty). */
  readonly attachSlots: readonly HexCoord[];
}

/** Six grid neighbors of `cell` among `levelCells` (same level), in HEX_DIRECTIONS order. */
export function neighborSlots(cell: Pick<Cell, 'coord'>, levelCells: readonly Cell[]): NeighborSlot[] {
  const byKey = new Map(levelCells.map((c) => [hexKey(c.coord), c]));
  return HEX_DIRECTIONS.map((dir) => {
    const coord = hexNeighbor(cell.coord, dir);
    const hit = byKey.get(hexKey(coord));
    return hit ? { dir, coord, cell: hit } : { dir, coord };
  });
}

/** Cell one step from `from` in `dir`, if present. */
export function navigate(from: Cell, dir: HexDirection, levelCells: readonly Cell[]): Cell | undefined {
  const target = hexNeighbor(from.coord, dir);
  return levelCells.find((c) => hexEquals(c.coord, target));
}

/**
 * Hive growth rule: a new cell must sit on a free slot adjacent to an existing cell of the
 * same level ("attached to the next one"). The first cell of a level goes to its root coord.
 */
export function canAttach(
  coord: HexCoord,
  levelCells: readonly Cell[],
  rootCoord: HexCoord = HEX_ORIGIN,
): { ok: true } | { ok: false; reason: 'occupied' | 'not-adjacent' | 'not-root' } {
  if (levelCells.length === 0) return hexEquals(coord, rootCoord) ? { ok: true } : { ok: false, reason: 'not-root' };
  const keys = new Set(levelCells.map((c) => hexKey(c.coord)));
  if (keys.has(hexKey(coord))) return { ok: false, reason: 'occupied' };
  const adjacent = HEX_DIRECTIONS.some((d) => keys.has(hexKey(hexNeighbor(coord, d))));
  return adjacent ? { ok: true } : { ok: false, reason: 'not-adjacent' };
}

/** Free attach slots around all cells of a level (for "add cell" UIs). */
export function attachSlots(levelCells: readonly Cell[]): HexCoord[] {
  const taken = new Set(levelCells.map((c) => hexKey(c.coord)));
  const out = new Map<string, HexCoord>();
  for (const c of levelCells) {
    for (const d of HEX_DIRECTIONS) {
      const n = hexNeighbor(c.coord, d);
      const k = hexKey(n);
      if (!taken.has(k)) out.set(k, n);
    }
  }
  return [...out.values()];
}
