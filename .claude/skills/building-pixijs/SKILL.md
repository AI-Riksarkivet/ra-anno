---
name: building-pixijs
description: "PixiJS v8 + Svelte 5/SvelteKit 2 for 2D graphics: rendering, Graphics API, events, filters, viewport pan/zoom, @pixi/layout, @pixi/ui, performance optimization. For document viewers, annotation tools, data visualization."
---

# PixiJS v8 + Svelte 5

Stack: SvelteKit 2, Svelte 5 (runes), PixiJS v8.17+ (WebGL2/WebGPU).

Install: `npm install pixi.js`

## Integration approach: plain PixiJS + Svelte onMount

Use PixiJS directly — **do NOT use svelte-pixi** for imperative rendering apps
(document viewers, annotation tools, data visualization). svelte-pixi is only
useful when your scene graph maps 1:1 to a Svelte component tree, which is rare
for performance-sensitive apps with dynamic data.

### Why plain PixiJS over svelte-pixi

- **Fewer dependencies** — library consumers only need `pixi.js`, not
  `svelte-pixi`
- **Imperative rendering** — annotation/data layers build Graphics from data
  arrays in loops, not from component trees
- **Event control** — precise listener ordering (e.g. pan vs draw tool) requires
  direct `addEventListener`
- **Library-friendly** — if packaging as npm library, fewer deps = easier
  adoption

### SvelteKit integration pattern

```svelte
<script lang="ts">
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import { Application } from 'pixi.js';

  let containerEl: HTMLDivElement;

  onMount(() => {
    if (!browser) return;
    const app = new Application();

    (async () => {
      await app.init({
        resizeTo: containerEl,
        preference: 'webgpu',
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      containerEl.appendChild(app.canvas);
      // Create plugins, set up scene...
    })();

    return () => app.destroy(true, { children: true });
  });
</script>

<div bind:this={containerEl} class="h-full w-full overflow-hidden"></div>
```

Key points:

- **SSR safety**: `onMount` only runs in browser. Add `if (!browser) return`
  guard.
- **Async init**: `await app.init()` — v8 requires this, not constructor
  options.
- **`app.canvas`** not `app.view` — v8 change.
- **Cleanup**: return cleanup function from `onMount` to destroy app.
- **`resizeTo`**: pass the container element for auto-resize.

## Reference files

All in `references/` relative to this file. **Read the relevant file(s) before
writing code.**

### Primary

| File                        | Contents                                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`examples.md`**           | **Read when writing code.** Copy-paste v8 patterns: Graphics API, events/drag, masks, filters, RenderLayer, text, mesh/shaders, DOMContainer, RenderTexture. |
| **`ecosystem.md`**          | **Read for layout, UI, extensions.** `@pixi/layout` (Yoga flexbox), `@pixi/ui`, extensions system, responsive/resize patterns, viewport pan/zoom.            |
| `core-concepts.md`          | Performance tips, render pipeline, scene graph, GC, RenderGroups, RenderLayers, culling                                                                      |
| `container-and-graphics.md` | Container API, v8 Graphics API deep dive (fills, strokes, SVG paths, pixel lines)                                                                            |

### Secondary

| File                         | Contents                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------- |
| `svelte-pixi.md`             | svelte-pixi wrapper library (optional — use only for simple declarative scenes) |
| `scene-objects.md`           | Sprite, Mesh, NineSliceSprite, ParticleContainer                                |
| `text.md`                    | Text, BitmapText, HTMLText, SplitText, TextStyle, TilingSprite                  |
| `interaction-and-effects.md` | Events/hit-testing, accessibility, filters, blend modes, color, math            |
| `assets.md`                  | Asset pipeline, bundles/manifests, compressed textures, SVG rendering           |
| `textures-and-ticker.md`     | Texture system, Ticker/frame timing                                             |
| `renderers.md`               | WebGL/WebGPU/Canvas renderer selection, CacheAsTexture                          |
| `application.md`             | Application class, resize plugin, ticker plugin                                 |
| `advanced-integration.md`    | Mixing PixiJS + Three.js                                                        |

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
  already-loaded assets. For images from API routes (no file extension), load
  via `HTMLImageElement` then `Texture.from(img)`.
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

## Design decisions for PixiJS + SvelteKit

### Architecture: plugins as pure TS classes

Keep PixiJS logic in **pure TypeScript classes** (plugins) with no Svelte or DOM
imports. The Svelte component is a thin wrapper that creates the Application,
instantiates plugins, and exposes reactive state via `$bindable` props.

```
PixiCanvas.svelte          — thin Svelte wrapper (onMount, props, context)
  ├── ImagePlugin.ts       — loads images, zoom/pan, viewport transforms
  ├── ArrowDataPlugin.ts   — Arrow Table → batched Graphics rendering
  └── AnnotationPlugin.ts  — drawing state machine, hit testing
```

This pattern makes plugins:

- **Testable** with Vitest without a browser
- **Reusable** across different Svelte components
- **Publishable** as a standalone library

### SSR safety

PixiJS requires DOM + WebGL/WebGPU. Use `onMount` (never runs on server) with a
`browser` guard, or `export const ssr = false` on the route.

### Performance scaling

| Object count | Approach                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------ |
| < 100        | Individual Graphics objects per item                                                       |
| 100–5000     | Batch by category (e.g. one Graphics per status color = 5 draw calls for 5000 annotations) |
| 5000+        | Add viewport culling, `isRenderGroup`, `cacheAsTexture`                                    |
| 10000+       | `ParticleContainer` with `Particle` instances                                              |

Additional levers: `isRenderGroup` (GPU container transforms), `cacheAsTexture`
(flatten static subtrees), `cullable`, `RenderLayer` (UI above filters), object
pooling, `GraphicsContext` (shared geometry).

### Viewport pan/zoom pattern

Use a Container with `isRenderGroup: true` as the viewport. Apply scale/position
transforms to the stage or viewport container. Handle wheel zoom centered on
cursor position.

```ts
// Zoom toward cursor
const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
const newZoom = Math.max(0.05, Math.min(50, zoom * factor));
panX = mouseX - (mouseX - panX) * (newZoom / zoom);
panY = mouseY - (mouseY - panY) * (newZoom / zoom);
zoom = newZoom;
stage.scale.set(zoom);
stage.position.set(panX, panY);
```

### Loading images from API routes (no file extension)

`Assets.load()` uses URL extension to detect format. API routes like
`/api/images/page-001` have no extension. Load via HTMLImageElement instead:

```ts
const img = new Image();
img.crossOrigin = "anonymous";
img.src = url;
await new Promise((resolve, reject) => {
  img.onload = resolve;
  img.onerror = reject;
});
const texture = Texture.from(img);
```

### Graphics batching (Rerun-inspired columnar rendering)

For data-driven rendering (annotations, overlays), batch shapes by visual
property (e.g. color) into a single Graphics object per group. This reduces GPU
draw calls from N to the number of groups.

```ts
// 5 draw calls instead of 5000
for (const [color, rowIndices] of colorGroups) {
  const g = graphicsMap.get(color);
  g.clear();
  for (const i of rowIndices) {
    g.rect(xCol[i], yCol[i], wCol[i], hCol[i]);
  }
  g.fill({ color, alpha: 0.15 });
  g.stroke({ color, width: 2 });
}
```

## Routing

| Task                           | Read                                                                        |
| ------------------------------ | --------------------------------------------------------------------------- |
| Set up pixi in SvelteKit       | This file (integration pattern above)                                       |
| Click/drag/pointer events      | `examples.md` → Events                                                      |
| Draw shapes/paths/curves       | `examples.md` → Graphics API, then `container-and-graphics.md`              |
| Filters or custom shaders      | `examples.md` → Filters / Mesh & Shaders, then `interaction-and-effects.md` |
| Text/labels/fonts              | `examples.md` → Text, then `text.md`                                        |
| Load textures/spritesheets     | `assets.md`, then `examples.md` → Asset Loading                             |
| Responsive layout / flexbox    | `ecosystem.md` → @pixi/layout                                               |
| Buttons / sliders / UI widgets | `ecosystem.md` → @pixi/ui                                                   |
| Responsive resize / scaling    | `ecosystem.md` → Responsive Patterns                                        |
| Pan / zoom / viewport          | `ecosystem.md` → Viewport Patterns                                          |
| Custom extensions              | `ecosystem.md` → Extensions System                                          |
| Slow rendering / optimization  | `core-concepts.md` → Performance Tips                                       |
| 10k+ objects                   | `core-concepts.md` → Performance Tips + ParticleContainer                   |
| UI above filtered content      | `examples.md` → RenderLayer                                                 |
| Declarative scene (simple)     | `svelte-pixi.md` (optional, for simple component-tree scenes only)          |
| Specific class API             | `api-reference-toc.md` → line range in `api-reference.md`                   |
