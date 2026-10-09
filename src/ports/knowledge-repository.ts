/**
 * KnowledgeRepository — driven port for the hive (levels, cells, links).
 *
 * Implementations:
 * - `MemoryKnowledgeRepository` (`../adapters`): in-memory, seeded (fictional mock data by default).
 * - HTTP, database or static-content adapters: same interface, outside this package.
 *
 * Invariants the core relies on (adapters must keep them; covered by `knowledgeRepositoryContract`):
 * - `(level, coord)` is unique per level.
 * - `saveCell` does NOT enforce hive growth rules; the use case checks `canAttach()` first.
 * - Returned objects are copies; mutating them must not change stored state.
 */

import type { HexCoord } from '../core/hex';
import type { Cell, CellId, CellLink, Level, LevelKind, LevelRef } from '../core/knowledge';

export interface KnowledgeRepository {
  /** The single university level (root of the hive). */
  getRoot(): Promise<Level>;

  /** Level by reference, or undefined. */
  getLevel(ref: LevelRef): Promise<Level | undefined>;

  /** Area or person level by its `handle`, or undefined. */
  findLevelByHandle(kind: Exclude<LevelKind, 'university'>, handle: string): Promise<Level | undefined>;

  /** Child levels (university → areas, area → persons), optionally filtered by kind. */
  listChildren(parent: LevelRef, kind?: LevelKind): Promise<Level[]>;

  /** All cells of one level's grid. */
  listCells(level: LevelRef): Promise<Cell[]>;

  /** Cell by id, or undefined. */
  getCell(id: CellId): Promise<Cell | undefined>;

  /** Cell at a coordinate of a level, or undefined (empty slot). */
  getCellAt(level: LevelRef, coord: HexCoord): Promise<Cell | undefined>;

  /** Explicit links touching `id` (as `from` or `to`). Grid adjacency is not stored as links. */
  listLinks(id: CellId): Promise<CellLink[]>;

  /** Create or replace a cell (by id). Rejects if another cell occupies `(level, coord)`. */
  saveCell(cell: Cell): Promise<Cell>;

  /** Create a link (idempotent for identical from/to/kind). */
  saveLink(link: CellLink): Promise<CellLink>;

  /** Delete a cell and its links. Returns false if it did not exist. */
  deleteCell(id: CellId): Promise<boolean>;
}
