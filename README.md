# @draht/hex

A small, framework-free TypeScript library for hexagonal "hive" navigation:

- **core**: axial hex math (pointy-top) and a knowledge-hive model. Levels (university → area → person) each own a grid of cells, and new cells must attach next to existing ones.
- **grid**: pure functions for drawing and operating a hex grid in any UI. It covers cell positions, polygon points and view bounds for pointy-top and flat-top layouts, keyboard intents resolved by screen angle, and roving-tabindex focus.

It is written to be shared between apps on different stacks, for example an Astro site (server-rendered markup with a small vanilla script) and an Angular app. Each app renders its own markup and shares only this code. There is no DOM access, no framework import and no runtime dependency.

## Install

The package is installed straight from Git, pinned to a tag. It is not published to a registry, so installing it needs no credentials.

```jsonc
// package.json
{
  "dependencies": {
    "@draht/hex": "github:draht-dev/hex#v0.1.0"
  }
}
```

```sh
bun add github:draht-dev/hex#v0.1.0
# or: npm install github:draht-dev/hex#v0.1.0
```

The package ships TypeScript source and has no build step, so your toolchain compiles it. Vite/Astro, the Angular CLI and Bun all handle this. Your TypeScript config needs `"moduleResolution": "bundler"` (or `"module": "preserve"`) and `lib` ES2022 or later. The source compiles cleanly under `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `verbatimModuleSyntax`. CI typechecks it with TypeScript 5.9 and with the pinned 6.x dev version, so either compiler works.

## Entry points

| Import | Contents |
|---|---|
| `@draht/hex/core` | Hex math: `HexCoord`, `HEX_DIRECTIONS`, `hexNeighbor`, `directionTo`, `directionVector`, `hexDistance`, `hexRing`, `hexSpiral`, `hexToPlane`, `hexCorners`, … Hive model: `Level`, `Cell`, `CellKind`, `CELL_KINDS`, `isCellKind`, `CellLink`, `LevelView`, `neighborSlots`, `navigate`, `canAttach`, `attachSlots` |
| `@draht/hex/ports` | Interfaces (types only): `KnowledgeRepository`, `Clock`, `HiveNavigator` |
| `@draht/hex/app` | `createHiveNavigator({ repo, clock })` |
| `@draht/hex/adapters` | `MemoryKnowledgeRepository`, `MOCK_KNOWLEDGE` (fictional sample data), `ManualClock` |
| `@draht/hex/contracts` | `knowledgeRepositoryContract`, `CONTRACT_SEED`: a `bun:test` suite for your own repository adapters. Import it from test files only. |
| `@draht/hex/grid` | Geometry (`gridPoint`, `gridPolygon`, `gridCorners`, `gridBounds`, `directionAngle`, `nearestDirection`, `nearestDirections`, `gridNeighbor`, `readingOrder`), keyboard (`keyIntent`, `DEFAULT_KEYMAP`, `UP_LEVEL_KEYS`), focus (`gridTabStop`, `gridAction`, `gridMove`, `focusableCells`) |
| `@draht/hex` | Everything in `core`, `ports`, `app` and `grid` |

## Navigate a hive

```ts
import { createHiveNavigator } from '@draht/hex/app';
import { MemoryKnowledgeRepository, ManualClock } from '@draht/hex/adapters';

const hive = createHiveNavigator({ repo: new MemoryKnowledgeRepository(), clock: new ManualClock() });

const root = await hive.rootLevel();                      // the university level
const view = await hive.openLevel(root.ref);              // cells (sorted), breadcrumb, parent, children
const area = await hive.findLevel('area', 'mock-area-a'); // area or person level by handle
const east = await hive.step(view!.cells[0]!, 'E');       // neighbor view, or undefined for an empty slot
```

To use your own data, implement `KnowledgeRepository` and run `knowledgeRepositoryContract('my-repo', (seed) => new MyRepo(seed))` from a `bun test` file.

### URLs are the app's job

The package builds no URLs and parses none. Each app maps its own routes to levels and back:

- Route to level: `rootLevel()` for the hive root, `findLevel(kind, handle)` for an area or person page.
- Level to route: build the path from `level.handle` in the app, with the app's prefix and trailing-slash rule.
- Cell to route: a cell's `target` (`{ type: 'route', path }`, `{ type: 'url', href }` or `{ type: 'level', level }`) is data from the repository. Store paths in the app's canonical form.

For example, if the hive is your homepage (`/`) and your router requires trailing slashes, store cell paths as `/section/page/`, not `/section/page`.

### Cell kinds

`CellKind` is a closed union: `topic`, `lesson`, `episode`, `exercise`, `course`, `link` and `level-portal`. The kind is a label for rendering (icon, style). The hive rules (`canAttach`, `navigate`, `neighborSlots`, `attach`) treat every kind alike, and where a cell leads is its `target`; a `course` cell usually carries `{ type: 'route', path }` to the course start page. A repository adapter that reads external data (JSON, a CMS, database rows) checks each kind with `isCellKind` (or against `CELL_KINDS`) and rejects or maps unknown values there, so the rest of the app can rely on the union.

## Draw and operate a grid

```ts
import { gridAction, gridBounds, gridPoint, gridPolygon, gridTabStop, keyIntent, type GridCell } from '@draht/hex/grid';

const orientation = 'pointy';                     // or 'flat'
const radius = 48;
const box = gridBounds(cells, radius, orientation);
const viewBox = `${box.x} ${box.y} ${box.width} ${box.height}`;
const points = gridPolygon(radius - 2, orientation); // <polygon points> for every cell
const centerOf = (cell: GridCell) => gridPoint(cell.coord, radius, orientation); // translate(x y)

// Roving tabindex: exactly this cell gets tabindex="0".
const tabStop = gridTabStop(cells, focusedId, selectedId, { orientation, isDisabled });

// `cellsHost` holds the cells and nothing else (no text inputs), see "Where to listen".
cellsHost.addEventListener('keydown', (event) => {
  const intent = keyIntent(event, { orientation });
  if (!intent) return;      // not ours: Tab, Ctrl/Cmd shortcuts, Alt+Arrow, IME input, dead keys …
  event.preventDefault();   // ours, even when gridAction below finds nothing to do
  const action = gridAction(intent, cells, focusedId, { orientation, isDisabled });
  if (action?.type === 'focus') focusCell(action.id); // a move also reports action.direction
  if (action?.type === 'activate') openCell(action.id);
  if (action?.type === 'up') goUpOneLevel();       // only with UP_LEVEL_KEYS, see below
});
```

### preventDefault follows keyIntent alone

Call `preventDefault()` if and only if `keyIntent` returns non-null. Do not make it depend on `gridAction`: a `null` action is a dead end (a move toward an empty or disabled slot, Home in a grid without enabled cells, any key on a disabled cell), not a key the grid ignored. Passing such keys on would make the page react depending on where focus happens to be: ArrowDown at the bottom edge of the hive would scroll the page, and Space on a disabled cell would page down.

### Tab stop

`gridTabStop(cells, focusedId, selectedId, options)` returns the id that gets `tabindex="0"`. The first candidate that is present and enabled wins:

1. `focusedId`, the cell that last had focus;
2. `selectedId`, for example the cell of the current page;
3. `options.initialId`, for example the hub cell of a level;
4. the first enabled cell in **input order** (default, `fallback: 'input-order'`), or with `fallback: 'reading-order'` the first enabled cell in reading order of `options.orientation` (top-left).

Input order is the default because hives are usually laid out as a spiral with the centre first (`hexSpiral`), so the first Tab lands on the centre. `null` comes back only when no cell is enabled.

### Moves and actions

`gridAction(intent, cells, currentId, { orientation, isDisabled })` resolves an intent against the cells:

| Intent | Result |
|---|---|
| move | `{ type: 'focus', id, direction }`: `direction` is the direction actually taken, which is the intent's `fallback` when the primary slot was empty or disabled. `null` at a dead end. |
| first / last | `{ type: 'focus', id }` (no `direction`): first / last enabled cell in reading order |
| activate | `{ type: 'activate', id }` for the current cell |
| up | `{ type: 'up' }`, always |

- **Disabled current cell:** every intent except `up` returns `null`. Focus should never rest on a disabled cell; if it does, nothing happens until Tab moves it.
- **Unknown current cell** (`null`, `undefined`, or an id no longer in `cells`): first / last still work, so Home/End lead back into the grid; move and activate return `null`.

`gridMove(cells, currentId, { direction, fallback }, { isDisabled })` is the move step on its own and returns `{ id, direction } | null` by the same rules. Use it when you resolve moves without `gridAction`, for example to animate the step in the direction it went.

### Where to listen

Attach the keydown listener to the cells, or to an element that contains only cells, never to a host that also contains text inputs, search fields or other widgets. Letter bindings match the physical key (`code`), whatever character it prints: the key that types `q` on QWERTY types `a` on AZERTY and `й` on a Cyrillic layout, and it is the Q move on all three. `keyIntent` does not check the printed character against the US layout, because that check would break the layout independence. In a listener on a host with an input, typing a word would move focus across the hive.

With SVG cells, don't put `focus`, `focusin` or `focusout` listeners on the `<svg>` or a `<g>`: Chromium then makes that element an extra tab stop in front of the cells. A `keydown` listener there is fine, and so are focus listeners on the cells or on an HTML wrapper.

## Keyboard semantics

`keyIntent(event, { orientation, keymap })` is pure. Pass it a `KeyboardEvent` or any object with `key`, `code`, `ctrlKey`, `metaKey`, `altKey`, `shiftKey` and `isComposing`. It returns an intent or `null`. Call `preventDefault()` for every non-null result and for nothing else (see [preventDefault follows keyIntent alone](#preventdefault-follows-keyintent-alone)).

| Key (default keymap) | Intent | pointy-top | flat-top |
|---|---|---|---|
| ArrowRight (0°) | move | E | NE, else E |
| ArrowUp (90°) | move | NW, else NE | NW |
| ArrowLeft (180°) | move | W | SW, else W |
| ArrowDown (270°) | move | SE, else SW | SE |
| Q (135°) | move | NW | W |
| W (90°) | move | NW, else NE | NW |
| E (45°) | move | NE | NE |
| A (180°) | move | W | SW, else W |
| D (0°) | move | E | NE, else E |
| Z (225°) | move | SW | SW |
| X (270°) | move | SE, else SW | SE |
| C (315°) | move | SE | E |
| Home / End | first / last | first / last focusable cell in reading order | same |
| Enter / Space | activate | focused cell | same |
| Escape / Backspace | up | **opt-in only**: `keymap: { ...DEFAULT_KEYMAP, ...UP_LEVEL_KEYS }` | same |

Rules:

- **Moves resolve by screen angle.** Each key has an intended screen direction (degrees counter-clockwise from right). The move goes to the hex direction whose on-screen angle is nearest in the current orientation.
- **Ties: counter-clockwise first, clockwise as fallback.** When a key sits exactly between two directions ("X, else Y" in the table), the move goes to the counter-clockwise one. If that slot is empty or disabled, it goes to the clockwise one instead. For example, ArrowUp in pointy-top is 30° from both NE and NW: it moves NW, or NE when there is no enabled NW neighbor. `keyIntent` returns `{ type: 'move', direction, fallback }` for these keys, and `gridAction` applies the rule. If you resolve intents yourself, apply it too. Without the fallback, arrow keys alone could never reach NE/SW (pointy) or E/W (flat), and keyboard-only users would get stuck in sparse hives. Opposite keys still resolve to opposite directions and opposite fallbacks, so a key followed by its opposite returns to the start cell whenever the first move used its primary direction. After a fallback move, the opposite key tries its own primary direction first, so it can land on a different cell.
- **Modifiers pass through.** With Ctrl, Meta (Cmd) or Alt held, `keyIntent` returns `null`, so copy, select-all, undo, bookmarks and Alt+Arrow history keep working.
- **Shift passes through.** Shift+Tab, Shift+Arrow and shifted letters return `null`.
- **IME input and dead keys pass through.** `isComposing`, key `'Process'` (an IME is handling the key; the first keydown of a composition arrives before `isComposing` is set) and key `'Dead'` (the start of an accented character) return `null`, even on a bound physical key and even if a custom keymap names them.
- **Letters match by physical key** (`KeyboardEvent.code`). The Q/W/E, A/D, Z/X/C cluster keeps its shape on AZERTY and QWERTZ. Events without `code` fall back to the US layout. The printed character is not checked, so listen on the cells only (see [Where to listen](#where-to-listen)).
- **Disabled cells** (`isDisabled`) never become the tab stop, a move target or an activation, and Home/End skip them. A move into an empty or disabled slot (after the fallback, if any) does nothing: it never jumps over the gap. A disabled current cell yields no action except `up`.
- If your cells are native links, you can drop `Enter` from the keymap and let the browser follow the link.

`keymap` replaces the default table. Extend it with object spread, or build your own from `{ type: 'move', angle }`, `{ type: 'first' }`, `{ type: 'last' }`, `{ type: 'activate' }` and `{ type: 'up' }` entries. Entry names are `code` values (`KeyQ`, `ArrowUp`, `Space`) or `key` values (`Enter`, `Escape`), and `code` is tried first.

## Orientation

The domain grid is **pointy-top** (`hexToPlane`, `hexCorners`). `'flat'` is a presentation choice: the drawing rotates 30° clockwise and matches the standard flat-top axial layout (x = 1.5·q·size, y = √3·(r + q/2)·size). Coordinates, neighbors and direction names stay the same. The names describe the pointy-top layout, so in flat-top `NW` points straight up and `E` points down-right. Use `directionAngle(dir, orientation)` when you need the on-screen angle. The keyboard functions do this for you.

## Development

```sh
bun install
bun run check            # typecheck with the pinned TypeScript 6.x and with 5.9, then all tests
bun test                 # tests only (the purity guard is one of them)
bun run purity           # the purity guard alone
bun run typecheck:ts5.9  # TypeScript 5.9 only
```

Layers import each other in one direction only: `core` imports nothing else, `grid` only `core`, `ports` only `core`, `app` only `core` and `ports` (full table in [ARCHITECTURE.md](./ARCHITECTURE.md)). The pure modules (`core`, `ports`, `app`, `grid`) use no DOM, timers, `Date.now()` or `Math.random()`. `test/purity.test.ts` resolves every relative import to its layer and checks it against the allow-list, and the DOM-free `tsconfig.json` makes DOM and runtime globals fail to compile in the pure modules. Time enters through the `Clock` port.

## License

[MIT](./LICENSE)
