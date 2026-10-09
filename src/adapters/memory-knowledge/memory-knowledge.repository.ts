/**
 * In-memory KnowledgeRepository. Seeded with MOCK_KNOWLEDGE by default; pass your own seed in
 * tests. Stores copies, so callers can't mutate repository state through returned objects.
 */
import { hexKey, type HexCoord } from '../../core/hex';
import type { Cell, CellId, CellLink, Level, LevelKind, LevelRef } from '../../core/knowledge';
import type { KnowledgeRepository } from '../../ports/knowledge-repository';
import { MOCK_KNOWLEDGE, type KnowledgeSeed } from './mock-data';

const refKey = (r: LevelRef): string => `${r.kind}/${r.id}`;
const clone = <T>(v: T): T => structuredClone(v);

export class MemoryKnowledgeRepository implements KnowledgeRepository {
  private readonly levels = new Map<string, Level>();
  private readonly cells = new Map<CellId, Cell>();
  private links: CellLink[] = [];

  constructor(seed: KnowledgeSeed = MOCK_KNOWLEDGE) {
    for (const l of seed.levels) this.levels.set(refKey(l.ref), clone(l));
    for (const c of seed.cells) this.cells.set(c.id, clone(c));
    this.links = seed.links.map(clone);
  }

  async getRoot(): Promise<Level> {
    const root = [...this.levels.values()].find((l) => l.ref.kind === 'university');
    if (!root) throw new Error('MemoryKnowledgeRepository: no university level in seed');
    return clone(root);
  }

  async getLevel(ref: LevelRef): Promise<Level | undefined> {
    const l = this.levels.get(refKey(ref));
    return l && clone(l);
  }

  async findLevelByHandle(kind: Exclude<LevelKind, 'university'>, handle: string): Promise<Level | undefined> {
    const l = [...this.levels.values()].find((x) => x.ref.kind === kind && (x.handle ?? x.ref.id) === handle);
    return l && clone(l);
  }

  async listChildren(parent: LevelRef, kind?: LevelKind): Promise<Level[]> {
    const pk = refKey(parent);
    return [...this.levels.values()]
      .filter((l) => l.parent && refKey(l.parent) === pk && (!kind || l.ref.kind === kind))
      .map(clone);
  }

  async listCells(level: LevelRef): Promise<Cell[]> {
    const lk = refKey(level);
    return [...this.cells.values()].filter((c) => refKey(c.level) === lk).map(clone);
  }

  async getCell(id: CellId): Promise<Cell | undefined> {
    const c = this.cells.get(id);
    return c && clone(c);
  }

  async getCellAt(level: LevelRef, coord: HexCoord): Promise<Cell | undefined> {
    const lk = refKey(level);
    const k = hexKey(coord);
    const c = [...this.cells.values()].find((x) => refKey(x.level) === lk && hexKey(x.coord) === k);
    return c && clone(c);
  }

  async listLinks(id: CellId): Promise<CellLink[]> {
    return this.links.filter((l) => l.from === id || l.to === id).map(clone);
  }

  async saveCell(cell: Cell): Promise<Cell> {
    if (!this.levels.has(refKey(cell.level))) throw new Error(`unknown level ${refKey(cell.level)}`);
    const other = await this.getCellAt(cell.level, cell.coord);
    if (other && other.id !== cell.id) throw new Error(`coord ${hexKey(cell.coord)} occupied by ${other.id}`);
    this.cells.set(cell.id, clone(cell));
    return clone(cell);
  }

  async saveLink(link: CellLink): Promise<CellLink> {
    this.links = this.links.filter((l) => !(l.from === link.from && l.to === link.to && l.kind === link.kind));
    this.links.push(clone(link));
    return clone(link);
  }

  async deleteCell(id: CellId): Promise<boolean> {
    const had = this.cells.delete(id);
    if (had) this.links = this.links.filter((l) => l.from !== id && l.to !== id);
    return had;
  }
}
