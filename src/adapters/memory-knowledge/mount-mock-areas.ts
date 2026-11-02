/**
 * Mount the mock areas under a caller-supplied university root.
 *
 * `MOCK_KNOWLEDGE` parents its areas at the fictional Mock University. This returns a new
 * `KnowledgeSeed` whose university level is `root` (for example
 * `{ ref: { kind: 'university', id: 'uni' }, title: 'Uni' }`), with each mock area's `parent`
 * set to `root.ref`. Person levels under those areas are copied with their parents unchanged,
 * and so are the cells and links that belong to the areas and persons. The mock university
 * level, the cells on its grid, and links that touch those cells stay out, so the root grid
 * stays empty for the caller's own cells. Areas are reached as children of the root
 * (`listChildren`, `LevelView.children`).
 *
 * `root` must be a university level. Neither `root` nor `MOCK_KNOWLEDGE` is mutated.
 */
import type { Level, LevelRef } from '../../core/knowledge';
import { MOCK_KNOWLEDGE, type KnowledgeSeed } from './mock-data';

const refKey = (ref: LevelRef): string => `${ref.kind}/${ref.id}`;
const clone = <T>(value: T): T => structuredClone(value);

export function mountMockAreas(root: Level): KnowledgeSeed {
  if (root.ref.kind !== 'university') {
    throw new Error(`mountMockAreas: root must be a university level (got '${root.ref.kind}')`);
  }

  const areaKeys = new Set(
    MOCK_KNOWLEDGE.levels.filter((level) => level.ref.kind === 'area').map((level) => refKey(level.ref)),
  );
  const rootLevel = clone(root);
  const mounted: Level[] = [];
  for (const level of MOCK_KNOWLEDGE.levels) {
    if (areaKeys.has(refKey(level.ref))) {
      mounted.push({ ...clone(level), parent: clone(rootLevel.ref) });
    } else if (level.parent && areaKeys.has(refKey(level.parent))) {
      mounted.push(clone(level));
    }
  }

  const mountedKeys = new Set(mounted.map((level) => refKey(level.ref)));
  const cells = MOCK_KNOWLEDGE.cells.filter((cell) => mountedKeys.has(refKey(cell.level))).map(clone);
  const cellIds = new Set(cells.map((cell) => cell.id));
  const links = MOCK_KNOWLEDGE.links.filter((link) => cellIds.has(link.from) && cellIds.has(link.to)).map(clone);
  return { levels: [rootLevel, ...mounted], cells, links };
}
