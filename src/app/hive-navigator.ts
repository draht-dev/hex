/**
 * createHiveNavigator: application service behind the HiveNavigator driving port.
 * Framework-free; depends only on core + the KnowledgeRepository and Clock ports.
 */
import { HEX_ORIGIN, hexKey, type HexCoord, type HexDirection } from '../core/hex';
import { attachSlots, canAttach, navigate, neighborSlots, type Cell, type CellView, type Level, type LevelRef, type LevelView } from '../core/knowledge';
import type { Clock } from '../ports/clock';
import type { KnowledgeRepository } from '../ports/knowledge-repository';
import type { HiveNavigator } from '../ports/use-cases';

export interface HiveNavigatorDeps {
  readonly repo: KnowledgeRepository;
  readonly clock: Clock;
}

export function createHiveNavigator({ repo, clock }: HiveNavigatorDeps): HiveNavigator {
  async function path(level: Level): Promise<LevelRef[]> {
    const out: LevelRef[] = [level.ref];
    let cur: Level | undefined = level;
    for (let guard = 0; cur?.parent && guard < 8; guard++) {
      out.unshift(cur.parent);
      cur = await repo.getLevel(cur.parent);
    }
    return out;
  }

  async function view(level: Level, cell: Cell, cells: readonly Cell[]): Promise<CellView> {
    return { level, cell, neighbors: neighborSlots(cell, cells), links: await repo.listLinks(cell.id), path: await path(level) };
  }

  return {
    async rootLevel() {
      return repo.getRoot();
    },

    async findLevel(kind, handle) {
      return repo.findLevelByHandle(kind, handle);
    },

    async openLevel(ref): Promise<LevelView | undefined> {
      const level = await repo.getLevel(ref);
      if (!level) return undefined;
      const [cells, children, crumbs, parent] = await Promise.all([
        repo.listCells(ref),
        repo.listChildren(ref),
        path(level),
        level.parent ? repo.getLevel(level.parent) : Promise.resolve(undefined),
      ]);
      const sorted = [...cells].sort((a, b) => a.coord.r - b.coord.r || a.coord.q - b.coord.q);
      return {
        level,
        cells: sorted,
        path: crumbs,
        ...(parent ? { parent } : {}),
        children,
        attachSlots: sorted.length > 0 ? attachSlots(sorted) : [level.rootCoord ?? HEX_ORIGIN],
      };
    },

    async open(ref, focus) {
      const level = await repo.getLevel(ref);
      if (!level) return undefined;
      const cells = await repo.listCells(ref);
      const at = focus ?? level.rootCoord ?? HEX_ORIGIN;
      const cell = cells.find((c) => hexKey(c.coord) === hexKey(at));
      return cell ? view(level, cell, cells) : undefined;
    },

    async step(from: Cell, dir: HexDirection) {
      const level = await repo.getLevel(from.level);
      if (!level) return undefined;
      const cells = await repo.listCells(from.level);
      const next = navigate(from, dir, cells);
      return next ? view(level, next, cells) : undefined;
    },

    async attach(input) {
      const level = await repo.getLevel(input.level);
      if (!level) return { ok: false, reason: 'unknown-level' };
      const title = input.title.trim();
      if (!title) return { ok: false, reason: 'empty-title' };
      const cells = await repo.listCells(input.level);
      const rule = canAttach(input.coord, cells, level.rootCoord ?? HEX_ORIGIN);
      if (!rule.ok) return { ok: false, reason: rule.reason };
      const coord: HexCoord = { q: input.coord.q, r: input.coord.r };
      const cell: Cell = {
        id: `${level.ref.kind}:${level.ref.id}:c${coord.q}_${coord.r}`,
        level: level.ref,
        coord,
        kind: input.kind,
        title,
        ...(input.summary ? { summary: input.summary } : {}),
        createdAtMs: clock.now(),
      };
      return { ok: true, cell: await repo.saveCell(cell) };
    },
  };
}
