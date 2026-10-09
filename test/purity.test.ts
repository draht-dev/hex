/**
 * Dependency rule guard. Every file under src/ belongs to one layer, its top-level folder
 * (core, ports, app, grid, adapters, contracts), except src/index.ts, the public barrel.
 *
 * - Layer direction: each relative import is resolved to the top-level folder it lands in and
 *   checked against LAYER_IMPORTS. src/index.ts may import any layer; nothing may import
 *   src/index.ts or anything outside src/.
 * - pure (core, ports, app, grid, index.ts): relative imports only; no ambient time, randomness,
 *   timers, network, runtime/DOM globals or DOM types.
 * - adapters: relative imports only; no DOM, timers or ambient time.
 * - contracts: relative imports plus 'bun:test'.
 * No file anywhere in src/ may import a UI framework, renderer or runtime module.
 * (tsconfig.json additionally compiles the pure group with lib ES2022 and no ambient types.)
 */
import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';

const root = join(import.meta.dir, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

const rel = (f: string): string => relative(root, f).split(sep).join('/');
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const importsOf = (src: string): string[] =>
  [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm)].map(
    (m) => m[1] ?? m[2] ?? m[3]!,
  );

/** Layer → layers it may import (relative imports, resolved to their top-level src folder). */
const LAYER_IMPORTS: Readonly<Record<string, readonly string[]>> = {
  core: ['core'],
  ports: ['core', 'ports'],
  app: ['core', 'ports', 'app'],
  grid: ['core', 'grid'],
  adapters: ['core', 'ports', 'adapters'],
  contracts: ['core', 'ports', 'adapters', 'contracts'],
};
const LAYERS = Object.keys(LAYER_IMPORTS);
/** The public barrel; the only file at the src root, and the only one that may import any layer. */
const BARREL = 'index.ts';

/**
 * Layer of a src-relative path such as 'core/hex.ts' or a resolved import target such as
 * 'core/hex' or 'core' (a folder import). The barrel ('index.ts', 'index' or '.') and other
 * root-level files are labelled but are not a layer; unknown folders give undefined.
 */
function layerOf(srcPath: string): string | undefined {
  if (srcPath === '.' || srcPath === 'index' || srcPath === BARREL) return 'barrel';
  const [top, ...rest] = srcPath.split('/');
  if (top !== undefined && LAYERS.includes(top)) return top;
  return rest.length === 0 ? `root file ${top}` : undefined;
}

/**
 * Layer-direction violations of one source file (`file` relative to src/, posix separators).
 * Only relative imports are checked here; package imports are policed per group below.
 */
function layerViolations(file: string, source: string): string[] {
  if (file === BARREL) return [];
  const from = layerOf(file);
  const allowed = from === undefined ? [] : (LAYER_IMPORTS[from] ?? []);
  const out: string[] = [];
  for (const spec of importsOf(source)) {
    if (!spec.startsWith('.')) continue;
    const target = posix.normalize(posix.join(posix.dirname(file), spec));
    const to = target === '..' || target.startsWith('../') ? 'outside src' : (layerOf(target) ?? `unknown folder ${target}`);
    if (!allowed.includes(to)) out.push(`${file} imports ${spec} (${from ?? 'unknown'} → ${to})`);
  }
  return out;
}

const PURE_DIRS = ['core', 'ports', 'app', 'grid'];
const all = files(root);

/** The real tree as [src-relative path, source] pairs, and the layer guard over a whole tree. */
const sourceTree = (): Array<[file: string, source: string]> => all.map((f) => [rel(f), readFileSync(f, 'utf8')]);
const treeViolations = (tree: ReadonlyArray<readonly [string, string]>): string[] =>
  tree.flatMap(([file, source]) => layerViolations(file, source));

const pure = all.filter((f) => PURE_DIRS.includes(rel(f).split('/')[0]!) || rel(f) === BARREL);
const adapters = all.filter((f) => rel(f).startsWith('adapters/'));
const contracts = all.filter((f) => rel(f).startsWith('contracts/'));

const IMPURE: Array<[RegExp, string]> = [
  [/\bDate\.now\s*\(/, 'Date.now()'],
  [/\bnew Date\s*\(/, 'new Date()'],
  [/\bMath\.random\s*\(/, 'Math.random()'],
  [/\b(setTimeout|setInterval|setImmediate|requestAnimationFrame|queueMicrotask)\s*\(/, 'timers'],
  [/\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(/, 'network'],
  [/\b(process|window|document|navigator|localStorage|sessionStorage|globalThis|location|history|CSS)\./, 'runtime globals'],
  [/\brequire\s*\(/, 'require()'],
];

const DOM_TYPES = /\b(HTML\w*Element|SVG\w*Element|Element|Node|EventTarget|KeyboardEvent|MouseEvent|PointerEvent|FocusEvent)\b/;

const FRAMEWORK = /^(@angular\/|react|react-dom|preact|vue|svelte|solid-js|lit|astro|@astrojs\/|three|rxjs|zone\.js|node:|bun$|fs$|path$)/;

describe('every source file is guarded', () => {
  test('src/ contains only the known layers and the barrel', () => {
    const unguarded = all.map(rel).filter((f) => f !== BARREL && !LAYERS.includes(f.split('/')[0]!));
    expect(unguarded).toEqual([]);
    expect(all.map(rel)).toContain(BARREL);
    for (const layer of LAYERS) expect(all.some((f) => rel(f).startsWith(`${layer}/`))).toBe(true);
  });

  test('tsconfig.json compiles every pure folder without DOM or ambient types', () => {
    const raw = readFileSync(join(import.meta.dir, '..', 'tsconfig.json'), 'utf8');
    const cfg = JSON.parse(raw) as { compilerOptions: { lib: string[]; types: string[] }; include: string[] };
    expect(cfg.compilerOptions.lib).toEqual(['ES2022']);
    expect(cfg.compilerOptions.types).toEqual([]);
    for (const dir of PURE_DIRS) expect(cfg.include).toContain(`src/${dir}/**/*`);
    expect(cfg.include).toContain('src/index.ts');
  });
});

describe('layer direction', () => {
  test('every relative import in src/ follows the allow-list', () => {
    expect(treeViolations(sourceTree())).toEqual([]);
  });

  test('forbidden edges are reported, in every import form', () => {
    const forbidden: Array<[file: string, source: string, layers: string]> = [
      ['core/hex.ts', "import { gridPoint } from '../grid/geometry';", 'core → grid'],
      ['core/knowledge.ts', "import type { Clock } from '../ports/clock';", 'core → ports'],
      ['core/hex.ts', "export * from '../app';", 'core → app'],
      ['ports/use-cases.ts', "import type { X } from '../app/hive-navigator';", 'ports → app'],
      ['ports/clock.ts', "import '../grid';", 'ports → grid'],
      ['app/hive-navigator.ts', "import { readingOrder } from '../grid/geometry';", 'app → grid'],
      ['app/hive-navigator.ts', "const m = await import('../adapters');", 'app → adapters'],
      ['grid/focus.ts', "import type { HiveNavigator } from '../ports/use-cases';", 'grid → ports'],
      ['grid/keyboard.ts', "export { createHiveNavigator } from '../app';", 'grid → app'],
      ['adapters/manual-clock/manual-clock.ts', "import { gridMove } from '../../grid/focus';", 'adapters → grid'],
      ['adapters/index.ts', "import { knowledgeRepositoryContract } from '../contracts';", 'adapters → contracts'],
      ['contracts/index.ts', "import { gridMove } from '../grid';", 'contracts → grid'],
      ['core/hex.ts', "import { hex } from '../index';", 'core → barrel'],
      ['grid/focus.ts', "import * as all from '..';", 'grid → barrel'],
      ['core/hex.ts', "import pkg from '../../package.json';", 'core → outside src'],
      ['app/index.ts', "import { x } from '../../test/hex.test';", 'app → outside src'],
      ['grid/geometry.ts', "import { y } from '../vendor/math';", 'grid → unknown folder vendor/math'],
    ];
    for (const [file, source, layers] of forbidden) {
      const found = layerViolations(file, source);
      expect({ file, source, found: found.length }).toEqual({ file, source, found: 1 });
      expect(found[0]).toEndWith(`(${layers})`);
    }
  });

  test('allowed edges pass', () => {
    const allowed: Array<[file: string, source: string]> = [
      ['core/knowledge.ts', "import { hexKey } from './hex';"],
      ['ports/use-cases.ts', "import type { Cell } from '../core/knowledge';\nimport type { Clock } from './clock';"],
      ['app/hive-navigator.ts', "import { canAttach } from '../core';\nimport type { Clock } from '../ports';\nexport * from './index';"],
      ['grid/focus.ts', "import { hexKey } from '../core/hex';\nimport { readingOrder } from './geometry';"],
      ['adapters/memory-knowledge/mock-data.ts', "import type { Cell } from '../../core/knowledge';\nimport { ManualClock } from '../manual-clock/manual-clock';"],
      ['contracts/x.contract.ts', "import { MOCK_KNOWLEDGE } from '../adapters';\nimport type { KnowledgeRepository } from '../ports';\nimport { test } from 'bun:test';"],
      [BARREL, "export * from './core';\nexport * from './adapters';\nexport * from './contracts';"],
    ];
    for (const [file, source] of allowed) expect({ file, found: layerViolations(file, source) }).toEqual({ file, found: [] });
  });

  test('a forbidden import added to a real file makes the whole-tree guard fail (mutation check)', () => {
    const real = sourceTree();
    for (const [file, spec, layers] of [
      ['core/hex.ts', '../grid/geometry', 'core → grid'],
      ['grid/focus.ts', '../ports/use-cases', 'grid → ports'],
      ['ports/clock.ts', '../adapters', 'ports → adapters'],
      ['adapters/manual-clock/manual-clock.ts', '../../app', 'adapters → app'],
    ] as const) {
      expect(real.some(([f]) => f === file)).toBe(true);
      const mutated = real.map(([f, source]): [string, string] => [f, f === file ? `${source}\nimport { mutant } from '${spec}';\n` : source]);
      expect(treeViolations(mutated)).toEqual([`${file} imports ${spec} (${layers})`]);
    }
  });
});

describe('pure modules (core, ports, app, grid)', () => {
  test('only relative imports', () => {
    const bad = pure.flatMap((f) => importsOf(readFileSync(f, 'utf8')).filter((s) => !s.startsWith('.')).map((s) => `${rel(f)} imports ${s}`));
    expect(bad).toEqual([]);
  });

  test('no ambient time, randomness, timers, network, runtime globals or DOM types', () => {
    const bad: string[] = [];
    for (const f of pure) {
      const code = stripComments(readFileSync(f, 'utf8'));
      for (const [re, label] of IMPURE) if (re.test(code)) bad.push(`${rel(f)}: ${label}`);
      if (DOM_TYPES.test(code)) bad.push(`${rel(f)}: DOM type`);
    }
    expect(bad).toEqual([]);
  });
});

describe('adapters stay framework-free', () => {
  test('imports limited to relative, no DOM/timers/ambient time', () => {
    const bad: string[] = [];
    for (const f of adapters) {
      const raw = readFileSync(f, 'utf8');
      for (const s of importsOf(raw)) if (!s.startsWith('.')) bad.push(`${rel(f)} imports ${s}`);
      const code = stripComments(raw);
      for (const [re, label] of IMPURE) if (re.test(code)) bad.push(`${rel(f)}: ${label}`);
      if (DOM_TYPES.test(code)) bad.push(`${rel(f)}: DOM type`);
    }
    expect(bad).toEqual([]);
  });
});

describe('contracts', () => {
  test('import only relative modules and bun:test', () => {
    const bad = contracts.flatMap((f) =>
      importsOf(readFileSync(f, 'utf8'))
        .filter((s) => !s.startsWith('.') && s !== 'bun:test')
        .map((s) => `${rel(f)} imports ${s}`),
    );
    expect(bad).toEqual([]);
  });
});

describe('no framework anywhere in src', () => {
  test('no UI framework, renderer or runtime module imports', () => {
    const bad = all.flatMap((f) => importsOf(readFileSync(f, 'utf8')).filter((s) => FRAMEWORK.test(s)).map((s) => `${rel(f)} imports ${s}`));
    expect(bad).toEqual([]);
  });
});
