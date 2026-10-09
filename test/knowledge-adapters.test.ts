import { describe, expect, test } from 'bun:test';
import { MemoryKnowledgeRepository, ManualClock, MOCK_KNOWLEDGE } from '../src/adapters';
import { CONTRACT_SEED, knowledgeRepositoryContract } from '../src/contracts';
import { CELL_KINDS, createHiveNavigator, hexKey, canAttach, type HiveNavigator } from '../src';

knowledgeRepositoryContract('MemoryKnowledgeRepository', (seed) => new MemoryKnowledgeRepository(seed));

describe('mock data', () => {
  test('fictional only, unique coords per level, all portals resolve', () => {
    const { levels, cells } = MOCK_KNOWLEDGE;
    const persons = levels.filter((l) => l.ref.kind === 'person');
    expect(persons.length).toBe(4);
    for (const p of persons) expect(p.title).toMatch(/\(Mock\)$/);
    const seen = new Set<string>();
    for (const c of cells) {
      const k = `${c.level.kind}/${c.level.id}@${hexKey(c.coord)}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      if (c.target?.type === 'level') {
        const t = c.target.level;
        expect(levels.some((l) => l.ref.kind === t.kind && l.ref.id === t.id)).toBe(true);
      }
    }
  });
});

describe('HiveNavigator over memory adapters', () => {
  const make = () => {
    const clock = new ManualClock(1_000);
    return { clock, nav: createHiveNavigator({ repo: new MemoryKnowledgeRepository(), clock }) };
  };

  test('finds levels by root and handle, without any URL scheme', async () => {
    const { nav } = make();
    expect((await nav.rootLevel()).ref).toEqual({ kind: 'university', id: 'mock-uni' });
    expect((await nav.findLevel('area', 'mock-area-a'))?.ref).toEqual({ kind: 'area', id: 'mock-area-a' });
    expect((await nav.findLevel('person', 'mock-student-b'))?.personRole).toBe('student');
    expect(await nav.findLevel('person', 'mock-area-a')).toBeUndefined();
    expect(await nav.findLevel('area', 'nope')).toBeUndefined();
    expect('resolveRoute' in nav).toBe(false);
  });

  test('open root cell, step to neighbour, breadcrumb path', async () => {
    const { nav } = make();
    const v = await nav.open({ kind: 'person', id: 'mock-student-b' });
    expect(v?.cell.id).toBe('person:mock-student-b:hub');
    expect(v?.path.map((r) => r.kind)).toEqual(['university', 'area', 'person']);
    expect(v?.neighbors.find((s) => s.dir === 'E')?.cell?.title).toBe('Cell P1 (Mock)');
    const east = await nav.step(v!.cell, 'E');
    expect(east?.cell.id).toBe('person:mock-student-b:w1');
    expect(await nav.step(east!.cell, 'E')).toBeUndefined();
    const w2 = await nav.open({ kind: 'person', id: 'mock-student-b' }, { q: 0, r: -1 });
    expect(w2?.links.length).toBe(1);
  });

  test('attach enforces the growth rule and stamps the clock', async () => {
    const { nav, clock } = make();
    const level = { kind: 'person', id: 'mock-student-c' } as const;
    expect(await nav.attach({ level, coord: { q: 9, r: 9 }, kind: 'topic', title: 'far' })).toEqual({ ok: false, reason: 'not-adjacent' });
    expect(await nav.attach({ level, coord: { q: 0, r: 0 }, kind: 'topic', title: 'dup' })).toEqual({ ok: false, reason: 'occupied' });
    expect(await nav.attach({ level, coord: { q: 2, r: 0 }, kind: 'topic', title: '  ' })).toEqual({ ok: false, reason: 'empty-title' });
    clock.advance(500);
    const res = await nav.attach({ level, coord: { q: 2, r: 0 }, kind: 'lesson', title: 'New cell (Mock)' });
    expect(res.ok && res.cell.createdAtMs).toBe(1_500);
    expect((await nav.open(level, { q: 2, r: 0 }))?.cell.title).toBe('New cell (Mock)');
  });

  test('course cells: mock data covers every kind; open, step and attach treat a course like any cell', async () => {
    expect(new Set(MOCK_KNOWLEDGE.cells.map((c) => c.kind))).toEqual(new Set(CELL_KINDS));
    const repo = new MemoryKnowledgeRepository();
    const nav = createHiveNavigator({ repo, clock: new ManualClock() });
    const root = (await nav.rootLevel()).ref;
    const course = (await nav.openLevel(root))!.cells.find((c) => c.kind === 'course')!;
    expect(course.target).toEqual({ type: 'route', path: '/mock/course-1/' });
    const view = await nav.open(root, course.coord);
    expect(view?.cell).toEqual(course);
    expect(view?.neighbors.find((s) => s.dir === 'W')?.cell?.kind).toBe('level-portal');
    // (2, 1) touches only the course cell, so the course alone makes it attachable.
    const res = await nav.attach({ level: root, coord: { q: 2, r: 1 }, kind: 'course', title: 'Course 2 (Mock)' });
    expect(res.ok && res.cell.kind).toBe('course');
    expect((await nav.step(course, 'E'))?.cell.title).toBe('Course 2 (Mock)');
    const fresh = new MemoryKnowledgeRepository();
    await fresh.deleteCell(course.id);
    const noCourse = createHiveNavigator({ repo: fresh, clock: new ManualClock() });
    expect(await noCourse.attach({ level: root, coord: { q: 2, r: 1 }, kind: 'topic', title: 'x' })).toEqual({ ok: false, reason: 'not-adjacent' });
  });
});

describe('ManualClock', () => {
  test('fires tickers per interval with carry-over', () => {
    const c = new ManualClock();
    const ticks: number[] = [];
    const stop = c.every(50, (_dt, now) => ticks.push(now));
    c.advance(120);
    expect(ticks).toEqual([50, 100]);
    c.advance(30);
    expect(ticks).toEqual([50, 100, 150]);
    stop();
    c.advance(100);
    expect(ticks.length).toBe(3);
    expect(c.activeTickers).toBe(0);
  });
});

describe('HiveNavigator.openLevel', () => {
  const nav = (): HiveNavigator => createHiveNavigator({ repo: new MemoryKnowledgeRepository(), clock: new ManualClock() });

  test('university: all cells sorted, children = areas, no parent, breadcrumb = [uni]', async () => {
    const v = (await nav().openLevel({ kind: 'university', id: 'mock-uni' }))!;
    expect(v.level.title).toBe('Mock University');
    expect(v.cells.length).toBe(10);
    const order = v.cells.map((c) => [c.coord.r, c.coord.q]);
    expect(order).toEqual([...order].sort((a, b) => a[0]! - b[0]! || a[1]! - b[1]!));
    expect(v.children.map((l) => l.ref.id).sort()).toEqual(['mock-area-a', 'mock-area-b', 'mock-area-c']);
    expect(v.parent).toBeUndefined();
    expect(v.path).toEqual([{ kind: 'university', id: 'mock-uni' }]);
    expect(v.attachSlots.length).toBeGreaterThan(0);
    for (const s of v.attachSlots) expect(canAttach(s, v.cells).ok).toBe(true);
  });

  test('person: parent area, full breadcrumb, no children; unknown level → undefined', async () => {
    const n = nav();
    const person = (await n.findLevel('person', 'mock-student-b'))!;
    const v = (await n.openLevel(person.ref))!;
    expect(v.cells.map((c) => c.id)).toContain('person:mock-student-b:hub');
    expect(v.parent?.ref).toEqual({ kind: 'area', id: 'mock-area-a' });
    expect(v.path.map((r) => r.kind)).toEqual(['university', 'area', 'person']);
    expect(v.children).toEqual([]);
    expect(await n.openLevel({ kind: 'area', id: 'nope' })).toBeUndefined();
  });

  test('matches the repository and reflects attach (contract seed, empty level → root slot)', async () => {
    const repo = new MemoryKnowledgeRepository(CONTRACT_SEED);
    const n = createHiveNavigator({ repo, clock: new ManualClock() });
    const area = { kind: 'area', id: 'a' } as const;
    const before = (await n.openLevel(area))!;
    expect(before.cells.map((c) => c.id)).toEqual((await repo.listCells(area)).map((c) => c.id));
    expect(before.children.map((l) => l.ref.id)).toEqual(['p']);
    await n.attach({ level: area, coord: before.attachSlots[0]!, kind: 'topic', title: 'New (Mock)' });
    expect((await n.openLevel(area))!.cells.length).toBe(before.cells.length + 1);
    await repo.deleteCell('p0');
    expect((await n.openLevel({ kind: 'person', id: 'p' }))!.attachSlots).toEqual([{ q: 0, r: 0 }]);
  });
});
