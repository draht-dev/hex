/**
 * MOCK DATA ONLY. Every level, person and cell here is invented placeholder data:
 * no real persons, no real handles, no personal data. Titles are structural placeholders.
 * Shape: one university, three areas, four persons, 4-10 cells per level.
 */
import type { HexCoord } from '../../core/hex';
import type { Cell, CellKind, CellLink, CellTarget, Level, LevelRef, PersonRole } from '../../core/knowledge';

export interface KnowledgeSeed {
  readonly levels: readonly Level[];
  readonly cells: readonly Cell[];
  readonly links: readonly CellLink[];
}

export const MOCK_UNI_ID = 'mock-uni';

const uni: LevelRef = { kind: 'university', id: MOCK_UNI_ID };
const area = (id: string): LevelRef => ({ kind: 'area', id });
const person = (id: string): LevelRef => ({ kind: 'person', id });

function cell(
  level: LevelRef,
  local: string,
  q: number,
  r: number,
  kind: CellKind,
  title: string,
  extra: { summary?: string; target?: CellTarget; tags?: string[] } = {},
): Cell {
  const coord: HexCoord = { q, r };
  return { id: `${level.kind}:${level.id}:${local}`, level, coord, kind, title, author: 'mock', ...extra };
}

const toLevel = (level: LevelRef): CellTarget => ({ type: 'level', level });

const SLOTS: ReadonlyArray<readonly [number, number]> = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

// ---- university ------------------------------------------------------------
const levels: Level[] = [{ ref: uni, title: 'Mock University' }];
const cells: Cell[] = [
  cell(uni, 'hub', 0, 0, 'topic', 'Mock University (hub)', { summary: 'Entry point, university level.' }),
  cell(uni, 'area-a', 1, -1, 'level-portal', 'Area A (Mock)', { target: toLevel(area('mock-area-a')) }),
  cell(uni, 'area-b', -1, 0, 'level-portal', 'Area B (Mock)', { target: toLevel(area('mock-area-b')) }),
  cell(uni, 'area-c', 0, 1, 'level-portal', 'Area C (Mock)', { target: toLevel(area('mock-area-c')) }),
  cell(uni, 'ep1', 1, 0, 'episode', 'Episode 1 (Mock)', { target: { type: 'route', path: '/mock/episode-1/' } }),
  cell(uni, 'lesson1', 0, -1, 'lesson', 'Lesson 1 (Mock)', { target: { type: 'route', path: '/mock/lesson-1/' } }),
  cell(uni, 'ref', -1, 1, 'link', 'Reference (Mock)', { target: { type: 'url', href: 'https://example.com/' } }),
  cell(uni, 'w1', 2, -1, 'topic', 'Topic U1 (Mock)'),
  cell(uni, 'w2', -2, 1, 'topic', 'Topic U2 (Mock)'),
  cell(uni, 'course1', 1, 1, 'course', 'Course 1 (Mock)', { target: { type: 'route', path: '/mock/course-1/' } }),
];

// ---- areas + persons -------------------------------------------------------
interface MockPerson { readonly id: string; readonly title: string; readonly role: PersonRole }
interface MockArea { readonly id: string; readonly letter: string; readonly title: string; readonly persons: MockPerson[] }

const AREAS: MockArea[] = [
  {
    id: 'mock-area-a', letter: 'A', title: 'Area A (Mock)',
    persons: [
      { id: 'mock-teacher-a', title: 'Teacher A (Mock)', role: 'teacher' },
      { id: 'mock-student-b', title: 'Student B (Mock)', role: 'student' },
    ],
  },
  { id: 'mock-area-b', letter: 'B', title: 'Area B (Mock)', persons: [{ id: 'mock-student-c', title: 'Student C (Mock)', role: 'student' }] },
  { id: 'mock-area-c', letter: 'C', title: 'Area C (Mock)', persons: [{ id: 'mock-teacher-d', title: 'Teacher D (Mock)', role: 'teacher' }] },
];

for (const a of AREAS) {
  const ref = area(a.id);
  levels.push({ ref, title: a.title, handle: a.id, parent: uni });
  cells.push(cell(ref, 'hub', 0, 0, 'topic', `${a.title} (hub)`));
  let i = 0;
  for (const p of a.persons) {
    const [q, r] = SLOTS[i++]!;
    const pref = person(p.id);
    cells.push(cell(ref, `p-${p.id}`, q, r, 'level-portal', p.title, { target: toLevel(pref) }));
    levels.push({ ref: pref, title: p.title, handle: p.id, parent: ref, personRole: p.role });
    cells.push(
      cell(pref, 'hub', 0, 0, 'topic', p.title),
      cell(pref, 'w1', 1, 0, 'topic', 'Cell P1 (Mock)'),
      cell(pref, 'w2', 0, -1, 'lesson', 'Cell P2 (Mock)'),
      cell(pref, 'w3', -1, 1, 'exercise', 'Cell P3 (Mock)'),
    );
  }
  while (i < SLOTS.length) {
    const [q, r] = SLOTS[i]!;
    cells.push(cell(ref, `w${i}`, q, r, 'topic', `Topic ${a.letter}${i} (Mock)`));
    i++;
  }
}

const links: CellLink[] = [
  { from: 'university:mock-uni:ep1', to: 'area:mock-area-a:hub', kind: 'continues' },
  { from: 'person:mock-student-b:w2', to: 'person:mock-teacher-a:w2', kind: 'prerequisite' },
];

export const MOCK_KNOWLEDGE: KnowledgeSeed = { levels, cells, links };
