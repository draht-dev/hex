/**
 * Driving ports: what UI adapters (pages, components, tests, scripts) call.
 * Implemented by the application services in `../app` (`createHiveNavigator`) on top of the
 * driven ports. UI code depends on these interfaces, never on concrete services.
 */

import type { HexCoord, HexDirection } from '../core/hex';
import type { Cell, CellKind, CellView, Level, LevelKind, LevelRef, LevelView } from '../core/knowledge';

/**
 * Hive navigation. Route-free: the app maps its URLs to levels (`rootLevel`, `findLevel`) and
 * levels back to URLs (`Level.handle`); this port knows no paths.
 */
export interface HiveNavigator {
  /** The university level (root of the hive). */
  rootLevel(): Promise<Level>;

  /** Area or person level by its `handle`, or undefined. */
  findLevel(kind: Exclude<LevelKind, 'university'>, handle: string): Promise<Level | undefined>;

  /** Whole level for grid pages: level, all cells, breadcrumb, parent, children, attach slots. */
  openLevel(level: LevelRef): Promise<LevelView | undefined>;

  /** View of a cell (focus defaults to the level's root cell). */
  open(level: LevelRef, focus?: HexCoord): Promise<CellView | undefined>;

  /** Step to the neighbor in `dir`; undefined if that slot is empty. */
  step(from: Cell, dir: HexDirection): Promise<CellView | undefined>;

  /** Attach a new cell next to existing ones (enforces `canAttach`). */
  attach(input: {
    level: LevelRef;
    coord: HexCoord;
    kind: CellKind;
    title: string;
    summary?: string;
  }): Promise<{ ok: true; cell: Cell } | { ok: false; reason: string }>;
}
