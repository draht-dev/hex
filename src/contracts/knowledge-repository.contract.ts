/**
 * Reusable contract suite for any KnowledgeRepository adapter (memory, HTTP, IndexedDB …).
 * Usage in a bun test file:
 *   knowledgeRepositoryContract('my-adapter', (seed) => new MyRepo(seed));
 * The factory receives a small fictional seed and must return a repository containing exactly it.
 */
import { describe, expect, test } from 'bun:test';
import type { Cell, Level, LevelRef } from '../core/knowledge';
import type { KnowledgeRepository } from '../ports/knowledge-repository';
import type { KnowledgeSeed } from '../adapters/memory-knowledge/mock-data';

const U: LevelRef = { kind: 'university', id: 'u' };
const A: LevelRef = { kind: 'area', id: 'a' };
const P: LevelRef = { kind: 'person', id: 'p' };
const c = (id: string, level: LevelRef, q: number, r: number): Cell => ({ id, level, coord: { q, r }, kind: 'topic', title: id });

export const CONTRACT_SEED: KnowledgeSeed = {
  levels: [
    { ref: U, title: 'U' },
    { ref: A, title: 'A', handle: 'area-a', parent: U },
    { ref: P, title: 'P', handle: 'demo-person', parent: A, personRole: 'student' },
  ] satisfies Level[],
  cells: [c('u0', U, 0, 0), c('u1', U, 1, 0), c('a0', A, 0, 0), c('p0', P, 0, 0)],
  links: [{ from: 'u1', to: 'a0', kind: 'portal' }],
};

export function knowledgeRepositoryContract(name: string, make: (seed: KnowledgeSeed) => KnowledgeRepository | Promise<KnowledgeRepository>): void {
  describe(`KnowledgeRepository contract: ${name}`, () => {
    test('root, levels, handles, children', async () => {
      const r = await make(CONTRACT_SEED);
      expect((await r.getRoot()).ref).toEqual(U);
      expect((await r.getLevel(A))?.title).toBe('A');
      expect(await r.getLevel({ kind: 'area', id: 'nope' })).toBeUndefined();
      expect((await r.findLevelByHandle('person', 'demo-person'))?.ref).toEqual(P);
      expect(await r.findLevelByHandle('area', 'demo-person')).toBeUndefined();
      expect((await r.listChildren(U)).map((l) => l.ref.id)).toEqual(['a']);
      expect(await r.listChildren(U, 'person')).toEqual([]);
    });

    test('cells by level, id and coord', async () => {
      const r = await make(CONTRACT_SEED);
      expect((await r.listCells(U)).map((x) => x.id).sort()).toEqual(['u0', 'u1']);
      expect((await r.getCell('a0'))?.level).toEqual(A);
      expect((await r.getCellAt(U, { q: 1, r: 0 }))?.id).toBe('u1');
      expect(await r.getCellAt(U, { q: 5, r: 5 })).toBeUndefined();
    });

    test('save, link, delete', async () => {
      const r = await make(CONTRACT_SEED);
      await r.saveCell(c('u2', U, -1, 0));
      expect((await r.getCellAt(U, { q: -1, r: 0 }))?.id).toBe('u2');
      await expect(r.saveCell(c('dup', U, 0, 0))).rejects.toThrow();
      await r.saveLink({ from: 'u2', to: 'p0', kind: 'see-also' });
      expect((await r.listLinks('p0')).length).toBe(1);
      expect(await r.deleteCell('u2')).toBe(true);
      expect(await r.deleteCell('u2')).toBe(false);
      expect(await r.listLinks('p0')).toEqual([]);
    });

    test('returned objects are copies', async () => {
      const r = await make(CONTRACT_SEED);
      const cell = (await r.getCell('u0'))! as { title: string };
      cell.title = 'mutated';
      expect((await r.getCell('u0'))?.title).toBe('u0');
    });
  });
}
