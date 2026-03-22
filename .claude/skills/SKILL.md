---
name: building-pixijs
description: >
  Builds high-performance 2D graphics applications using PixiJS v8 with svelte-pixi
  in Svelte 5 / SvelteKit 2. Covers rendering, drawing, events, filters, shaders,
  text, meshes, asset loading, responsive layout (@pixi/layout flexbox), UI components
  (@pixi/ui), extensions, resize/viewport patterns, and performance optimization for
  professional 2D web applications (document viewers, annotation tools, data
  visualization). Triggers on mentions of pixi, pixijs, pixi.js, svelte-pixi,
  WebGL 2D, WebGPU 2D, canvas rendering, sprite, Graphics, Container, Ticker,
  RenderLayer, pixi layout, pixi UI, responsive canvas, viewport pan zoom, or
  requests involving performant 2D browser graphics and architecture patterns.
---

# PixiJS v8 + Svelte 5

Stack: SvelteKit 2, Svelte 5 (runes), `svelte-pixi` v8, PixiJS v8.17+
(WebGL2/WebGPU).

Install: `npm install pixi.js svelte-pixi`

## Reference files

All in `references/` relative to this file. **Read the relevant file(s) before
writing code.**

### Primary

| File                        | Contents                                                                                                                                                                                                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`svelte-pixi.md`**        | **Read first.** All svelte-pixi components and utilities, SvelteKit SSR safety, render-on-demand, ticker patterns (`onTick`, `tick`), asset loading (`AssetsLoader`), Svelte 5 event callbacks, masks, `svelte/motion` integration, performance escape hatches, bundle size reduction. Svelte 5 only.                                               |
| **`examples.md`**           | **Read when writing code.** Copy-paste v8 patterns from official PixiJS examples: Graphics API (shapes, curves, gradients, holes, SVG), events/drag, masks (basic, inverse, blur), filters (Blur, ColorMatrix, Displacement, custom GLSL), RenderLayer, RenderGroup, text (tagged, split, bitmap), mesh/shaders, GSAP, DOMContainer, RenderTexture. |
| **`ecosystem.md`**          | **Read for layout, UI, extensions.** `@pixi/layout` (Yoga flexbox), `@pixi/ui` (buttons, sliders, scrollbox), extensions system (types, creating custom), responsive/resize patterns, viewport pan/zoom, custom UI patterns.                                                                                                                        |
| `core-concepts.md`          | Performance tips, render pipeline, scene graph, GC, RenderGroups, RenderLayers, culling                                                                                                                                                                                                                                                             |
| `container-and-graphics.md` | Container API, v8 Graphics API deep dive (fills, strokes, SVG paths, pixel lines)                                                                                                                                                                                                                                                                   |

### Secondary

| File                         | Contents                                                              |
| ---------------------------- | --------------------------------------------------------------------- |
| `scene-objects.md`           | Sprite, Mesh, NineSliceSprite, ParticleContainer                      |
| `text.md`                    | Text, BitmapText, HTMLText, SplitText, TextStyle, TilingSprite        |
| `interaction-and-effects.md` | Events/hit-testing, accessibility, filters, blend modes, color, math  |
| `assets.md`                  | Asset pipeline, bundles/manifests, compressed textures, SVG rendering |
| `textures-and-ticker.md`     | Texture system, Ticker/frame timing                                   |
| `renderers.md`               | WebGL/WebGPU/Canvas renderer selection, CacheAsTexture                |
| `application.md`             | Application class, resize plugin, ticker plugin                       |
| `advanced-integration.md`    | Mixing PixiJS + Three.js                                              |

### API lookup

`api-reference-toc.md` → index of 93 exported classes with line numbers →
`api-reference.md` (22K lines, use `view` with line ranges).

## Critical v8 differences

These patterns changed from v7. Claude's training data likely reflects v7 and
will generate wrong code without these.

### Initialization & structure

- **Async init**: `await app.init(options)` — not constructor options
- **`app.canvas`** not `app.view`
- **All constructors use options objects**: `new BlurFilter({ blur: 8 })` not
  `new BlurFilter(8)`. Applies to Text, BitmapText, HTMLText, Mesh, MeshPlane,
  NineSliceSprite, TilingSprite, DisplacementFilter, etc.
- **Single package**: `import { X } from 'pixi.js'` — no more `@pixi/sprite`,
  `@pixi/app` etc.
- **`skipExtensionImports`**: tree-shaking via selective `import 'pixi.js/app'`
  etc.

### Scene graph

- **Leaf nodes cannot have children**: Sprite, Graphics, Mesh, Text,
  TilingSprite, HTMLText cannot `addChild()`. Only Container can. Wrap in
  Container if nesting needed.
- **`container.label`** replaces `container.name`
- **`container.origin`**: new property, CSS-like transform-origin (distinct from
  pivot — origin doesn't shift position)
- **`onRender` replaces `updateTransform`**:
  `container.onRender = () => { ... }` — the old override pattern no longer runs
  per frame
- **`getBounds()` returns `Bounds`**, not `Rectangle` — use
  `container.getBounds().rectangle`
- **`reparentChild()`**: preserves world transform when moving between
  containers

### Rendering & display

- **Graphics**: chained `.rect().fill().stroke()` — no `beginFill`/`endFill`
- **GraphicsContext**: reusable shared geometry — `new Graphics(context)` where
  multiple Graphics share one context
- **RenderLayer**: new class for rendering children above filtered containers
  (`layer.attach(child)`)
- **DOMContainer**: new class for embedding HTML elements in the scene graph
  with transforms
- **CullerPlugin**: opt-in — `extensions.add(CullerPlugin)`. Set
  `cullable = true` on containers.
- **`cacheAsTexture()`** replaces `cacheAsBitmap`. Call `updateCacheTexture()`
  after changes.

### Text

- **Text**: `new Text({ text, style })` options object — not positional args
- **Tagged text**: `style.tagStyles` for inline `<bold>` style tags (new in
  v8.16)
- **SplitText/SplitBitmapText**: per-character/word/line animation containers
  (experimental)
- **GifSprite**: new, from `import { GifSprite } from 'pixi.js/gif'`

### Assets & textures

- **Assets**: `await Assets.load()` — `PIXI.Loader` removed entirely
- **`Assets.add({ alias, src })`** — object form, not positional args
- **Textures must be loaded before use** — `Texture.from()` only works for
  already-loaded assets
- **`SCALE_MODES` → strings**: `'nearest'`, `'linear'` (not
  `SCALE_MODES.NEAREST`)
- **`WRAP_MODES` → strings**: `'repeat'`, `'clamp-to-edge'`, `'mirror-repeat'`

### Events & interaction

- **Default `eventMode` is `passive`** — must set `'static'` or `'dynamic'` for
  interactive objects
- **Ticker callback passes `Ticker` instance**, not delta — use
  `ticker.deltaTime`, `ticker.elapsedMS`

### Masks & filters

- **Masks**: `setMask({ mask, inverse })` for inverse masks
- **Filters**: `filter.antialias` replaces `filter.resolution`
- **Custom filters**:
  `new Filter({ glProgram: GlProgram.from({...}), resources: {...} })` —
  textures are resources, not uniforms
- **Community filters**: `import { X } from 'pixi-filters/x'` not
  `@pixi/filter-x`

### Particles

- **ParticleContainer uses `Particle`, not `Sprite`**:
  `addParticle()`/`removeParticle()` — particles have
  `scaleX`/`scaleY`/`anchorX`/`anchorY`/`color`, not the full Container API.
  Stored in `particleChildren`, not `children`.

### Misc

- **`utils` removed** — direct imports: `import { isMobile } from 'pixi.js'`
- **`settings` removed** — use `AbstractRenderer.defaultOptions` or pass to init

## PixiJS-specific design decisions

These are decisions specific to PixiJS + SvelteKit that Claude should follow:

**SSR**: PixiJS requires DOM + WebGL. Always gate behind `{#if browser}` with
dynamic import, or `export const ssr = false` on the route. See `svelte-pixi.md`
for patterns.

**Render mode**: Default to `render="demand"` for non-game applications
(document viewers, tools, dashboards). This avoids wasting CPU when nothing
changes. Components auto-invalidate on prop changes; call `invalidate()` for
imperative mutations.

**Performance scaling**:

| Object count | Approach                                                     |
| ------------ | ------------------------------------------------------------ |
| < 1000       | Declarative svelte-pixi components                           |
| 1000–10000   | `<Container bind:instance>` + imperative `new PIXI.Sprite()` |
| 10000+       | `<ParticleContainer>` with `PIXI.Particle` instances         |

Additional levers: `isRenderGroup` (GPU container transforms), `cacheAsTexture`
(flatten static subtrees), `cullable`, `RenderLayer` (UI above filters), object
pooling.

**Testability**: Keep PixiJS logic (viewport math, hit testing, coordinate
transforms) in pure TypeScript classes with no Svelte or DOM imports. These are
testable with Vitest without a browser. Svelte components should be thin
wrappers that bind these systems to the svelte-pixi render tree.

## Routing

| Task                           | Read                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| Set up pixi in SvelteKit       | `svelte-pixi.md`                                                            |
| Click/drag/pointer events      | `svelte-pixi.md` → Events, then `examples.md` → Events                      |
| Draw shapes/paths/curves       | `examples.md` → Graphics API, then `container-and-graphics.md`              |
| Filters or custom shaders      | `examples.md` → Filters / Mesh & Shaders, then `interaction-and-effects.md` |
| Text/labels/fonts              | `examples.md` → Text, then `text.md`                                        |
| Load textures/spritesheets     | `svelte-pixi.md` → AssetsLoader, then `examples.md` → Asset Loading         |
| Responsive layout / flexbox    | `ecosystem.md` → @pixi/layout                                               |
| Buttons / sliders / UI widgets | `ecosystem.md` → @pixi/ui                                                   |
| Responsive resize / scaling    | `ecosystem.md` → Responsive Patterns                                        |
| Pan / zoom / viewport          | `ecosystem.md` → Viewport Patterns                                          |
| Custom extensions              | `ecosystem.md` → Extensions System                                          |
| Slow rendering / optimization  | `core-concepts.md` → Performance Tips                                       |
| 10k+ objects                   | `examples.md` → Performance Patterns, then `core-concepts.md`               |
| UI above filtered content      | `examples.md` → RenderLayer                                                 |
| GSAP animation                 | `examples.md` → GSAP Integration                                            |
| Embed HTML in canvas           | `examples.md` → DOMContainer                                                |
| Specific class API             | `api-reference-toc.md` → line range in `api-reference.md`                   |
