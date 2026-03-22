# SveltePixi — Declarative PixiJS v8 for Svelte 5

**Package**: `svelte-pixi` (v8.0.1+) **Docs**: https://svelte-pixi.com
**Stack**: Svelte 5 + SvelteKit 2 + PixiJS v8 + Vite

## Contents

- Core Pattern
- SvelteKit SSR Safety
- Components (Application, Container, Sprite, Graphics, Text, BitmapText,
  HTMLText, AssetsLoader, AnimatedSprite, TilingSprite, NineSliceSprite,
  ParticleContainer, Mesh/MeshPlane/MeshRope/PerspectiveMesh, Ticker, Renderer)
- Utilities (getApp, getRenderer, getContainer, getStage, getTicker, onTick,
  tick, asset/texture, onContainerEvent, onStageEvent)
- Events (Svelte 5 callback props)
- Render on Demand
- Reducing Bundle Size
- Animation with svelte/motion
- Masks
- Binding / Tracking Instance Props
- PointLike Type
- Performance Escape Hatches

```bash
npm install pixi.js svelte-pixi
```

## Core Pattern

All pixi components must be descendants of `<Application>` (or `<Renderer>` +
`<Ticker>` + `<Container>` manually). Import from `svelte-pixi` (the default
export is Svelte 5).

```svelte
<script>
  import { Application, Text, Sprite, Container } from 'svelte-pixi'
  import * as PIXI from 'pixi.js'
</script>

<Application width={800} height={600} antialias>
  <Container x={100} y={100}>
    <Text text="Hello" style={{ fill: 'white' }} anchor={0.5} />
  </Container>
</Application>
```

## SvelteKit SSR Safety

PixiJS requires DOM + WebGL/WebGPU. It **cannot** run during SSR. Two
approaches:

```svelte
<!-- Option A: Dynamic import (recommended) -->
<script>
  import { browser } from '$app/environment'
</script>

{#if browser}
  {#await import('$lib/pixi/PixiCanvas.svelte') then { default: PixiCanvas }}
    <PixiCanvas />
  {/await}
{/if}

<!-- Option B: Disable SSR for the route -->
<!-- +page.ts -->
<!-- export const ssr = false -->
```

The SvelteKit example from the repo uses Option A:

```svelte
<!-- src/routes/+page.svelte -->
{#await import('$lib/PixiApp.svelte') then App}
  <App.default />
{/await}
```

## Components

### Application

Creates renderer, ticker, and root container. Initialization is **async**
(PixiJS v8).

```svelte
<script>
  import { Application, Text } from 'svelte-pixi'
  let app = $state()
</script>

<Application
  bind:instance={app}
  width={800}
  height={600}
  antialias
  autoDensity
  render="demand"
  oninit={() => console.log('ready', app.renderer)}
>
  {#snippet loading()}
    <!-- shown during async init -->
  {/snippet}

  {#snippet view()}
    <div class="my-canvas-wrapper">
      <!-- canvas appended here -->
    </div>
  {/snippet}

  {#snippet stage({ app, children })}
    <Container
      instance={app.stage}
      hitArea={app.screen}
      eventMode="static"
      onpointermove={(e) => console.log(e.data.global)}
    >
      {@render children()}
    </Container>
  {/snippet}

  <Text text="Hello" x={400} y={300} anchor={0.5} style={{ fill: 'white' }} />
</Application>
```

Key props: all `PIXI.ApplicationOptions` + `render` (`'auto'` | `'demand'`),
`oninit`, `onrender`.

### Container

Base for all display objects. Child coordinates become local to parent.

```svelte
<script>
  import { Container } from 'svelte-pixi'
  let container = $state()
</script>

<Container
  bind:instance={container}
  x={100} y={100}
  alpha={0.8}
  rotation={0.1}
  scale={2}
  pivot={{ x: 50, y: 50 }}
  visible={true}
  cullable={true}
  eventMode="static"
  cursor="pointer"
  onclick={(e) => console.log('clicked')}
  isRenderGroup={false}
  cacheAsTexture={false}
>
  <!-- children here -->
</Container>
```

**Custom instance pattern** — extend PIXI classes and pass your own instance:

```svelte
<script>
  import * as PIXI from 'pixi.js'
  import { Container } from 'svelte-pixi'

  class Viewport extends PIXI.Container {
    panTo(x, y) { this.position.set(x, y) }
  }
  const instance = new Viewport()
</script>
<Container {instance} x={0} y={0}>
  <!-- children rendered inside your custom class -->
</Container>
```

### Sprite

Textures **must** be loaded before use (PixiJS v8 requirement).

```svelte
<script>
  import * as PIXI from 'pixi.js'
  import { Sprite } from 'svelte-pixi'
</script>

<Sprite
  x={200} y={200}
  texture={PIXI.Texture.from('/assets/image.png')}
  anchor={0.5}
  scale={2}
  tint={0xff0000}
  blendMode="normal"
  eventMode="static"
  onclick={handleClick}
/>
```

### Graphics

Use the `draw` prop — it runs inside `$effect()` so it re-executes when
referenced state changes.

```svelte
<script>
  import { Graphics, tick } from 'svelte-pixi'

  let size = tick(t => 100 + Math.sin(t.lastTime / 700) * 50)

  function draw(graphics) {
    graphics.clear()
    graphics.circle(0, 0, $size).fill('darksalmon')
  }
</script>

<Graphics x={375} y={200} {draw} />
```

v8 Graphics API (chained, no beginFill/endFill):

```typescript
graphics.clear();
graphics.rect(0, 0, 100, 50).fill({ color: 0x3498db, alpha: 0.8 });
graphics.circle(50, 25, 20).stroke({ color: 0xffffff, width: 2 });
graphics.moveTo(0, 0).lineTo(100, 100).stroke({ color: 0xff0000, width: 1 });
```

### Text / BitmapText / HTMLText

```svelte
<!-- Canvas-rendered text -->
<Text text="Hello" x={100} y={100} anchor={0.5}
  style={{ fill: 'white', fontSize: 24, fontFamily: 'Arial' }} />

<!-- Bitmap font text (font must be loaded first) -->
<AssetsLoader assets={['/fonts/myFont.xml']}>
  <BitmapText text="Fast text" style={{ fontFamily: 'MyFont', fontSize: 32 }} />
</AssetsLoader>

<!-- HTML-rendered text -->
<HTMLText text="<b>Bold</b> and <i>italic</i>" style={{ fill: 'white' }} />
```

### AssetsLoader

Loads assets as a bundle. Children render only after loading completes.

```svelte
<script>
  import * as PIXI from 'pixi.js'
  import { AssetsLoader, Sprite, Text } from 'svelte-pixi'
</script>

<AssetsLoader assets={['/textures/page.png', '/textures/icons.json']}>
  <Sprite texture={PIXI.Texture.from('/textures/page.png')} />

  {#snippet loading({ progress })}
    <Text text={`Loading ${Math.round(progress * 100)}%`}
      x={400} y={300} anchor={0.5} style={{ fill: 'white' }} />
  {/snippet}
</AssetsLoader>
```

### AnimatedSprite

```svelte
<AnimatedSprite
  textures={[PIXI.Texture.from('frame-0.png'), PIXI.Texture.from('frame-1.png')]}
  playing
  animationSpeed={0.1}
  loop={true}
  anchor={0.5}
  onloop={() => console.log('looped')}
/>
```

### TilingSprite

```svelte
<TilingSprite
  texture={PIXI.Texture.from('/bg-tile.jpg')}
  width={800} height={600}
  tilePosition={{ x: offsetX, y: offsetY }}
  tileScale={{ x: 1, y: 1 }}
/>
```

### NineSliceSprite

```svelte
<NineSliceSprite
  texture={PIXI.Texture.from('/panel.png')}
  leftWidth={12} topHeight={12} rightWidth={12} bottomHeight={12}
  width={200} height={100}
/>
```

### ParticleContainer

For rendering thousands of uniform sprites. Use imperative API for particles:

```svelte
<script>
  import * as PIXI from 'pixi.js'
  import { ParticleContainer, onTick } from 'svelte-pixi'

  let container = $state()

  let particles = $derived.by(() => {
    if (!container) return []
    container.removeChildren()
    return Array.from({ length: 5000 }, () => {
      const p = new PIXI.Particle(PIXI.Texture.from('/star.png'))
      p.x = Math.random() * 800
      p.y = Math.random() * 600
      container.addParticle(p)
      return p
    })
  })

  $effect(() => {
    if (container) {
      for (const p of particles) container.addParticle(p)
      let _p = particles
      return () => { for (const p of _p) container.removeParticle(p) }
    }
  })

  onTick((ticker) => {
    for (const p of particles) {
      p.y += 0.5 * ticker.deltaTime
      if (p.y > 600) p.y = 0
    }
  })
</script>

<ParticleContainer bind:instance={container} />
```

### Mesh / MeshPlane / MeshRope / PerspectiveMesh

```svelte
<MeshPlane texture={tex} verticesX={10} verticesY={10} />
<MeshRope texture={tex} points={pointArray} textureScale={0} />
<PerspectiveMesh texture={tex} x0={0} y0={0} x1={w} y1={0} x2={w} y2={h} x3={0} y3={h} />
```

### Ticker

Application creates one automatically. Children hook in via `onTick`.

```svelte
<Ticker ontick={(ticker) => { /* per-frame logic */ }}>
  <!-- children can use onTick() -->
</Ticker>
```

### Renderer

Lower-level alternative to Application — you manage the render loop yourself:

```svelte
<Renderer bind:instance={renderer} width={800} height={600} antialias>
  <Ticker ontick={() => renderer.render(stage)}>
    <Container bind:instance={stage}>
      <!-- scene here -->
    </Container>
  </Ticker>
</Renderer>
```

## Utilities

### Context accessors (call during component init)

```typescript
import {
  getApp,
  getContainer,
  getRenderer,
  getStage,
  getTicker,
} from "svelte-pixi";

const { app } = getApp(); // PIXI.Application
const { renderer, invalidate } = getRenderer(); // PIXI.Renderer + demand-render trigger
const { container } = getContainer(); // parent PIXI.Container
const { stage } = getStage(); // root Container
const { ticker } = getTicker(); // PIXI.Ticker
```

### onTick — imperative per-frame callback

```svelte
<script>
  import { onTick } from 'svelte-pixi'

  let x = $state(0)
  onTick((ticker) => {
    x += ticker.deltaTime
  })
</script>
```

Auto-removes on component unmount. Requires parent `<Ticker>` (Application
provides one).

### tick — reactive store updated per frame

```svelte
<script>
  import { tick } from 'svelte-pixi'

  // Returns a Writable<T> store
  const pos = tick((ticker) => ({
    x: 400 + Math.cos(ticker.lastTime / 1000) * 100,
    y: 300 + Math.sin(ticker.lastTime / 1000) * 100,
  }))

  // With accumulator
  const elapsed = tick((ticker, prev = 0) => prev + ticker.deltaTime)
</script>

<Sprite x={$pos.x} y={$pos.y} ... />
```

### asset / texture — lazy-loading stores

```svelte
<script>
  import { texture } from 'svelte-pixi'
  const tex = texture('/assets/image.png') // Readable<PIXI.Texture>
</script>
<Sprite texture={$tex} ... />
```

### Event listeners on parent/stage

```typescript
import { onContainerEvent, onStageEvent } from "svelte-pixi";

onContainerEvent("click", (e) => {/* ... */});
onStageEvent("pointermove", (e) => {/* ... */});
```

## Events (Svelte 5 callback props)

All Container-based components support pointer/mouse/touch events as callback
props:

```svelte
<Sprite
  eventMode="static"
  cursor="pointer"
  onclick={(e) => {}}
  onpointerdown={(e) => {}}
  onpointerup={(e) => {}}
  onpointermove={(e) => {}}
  onpointerover={(e) => {}}
  onpointerout={(e) => {}}
  onglobalpointermove={(e) => {}}
  onrightclick={(e) => {}}
  ontap={(e) => {}}
  ontouchstart={(e) => {}}
  ontouchmove={(e) => {}}
  ontouchend={(e) => {}}
/>
```

**Note**: Event data is directly on `e` (e.g. `e.data.global`, `e.global`), NOT
wrapped in `e.detail` (that was Svelte 4 `on:` syntax).

## Render on Demand

For non-game UIs, avoid burning 60fps when nothing changes:

```svelte
<Application render="demand" width={800} height={600}>
  <!-- only re-renders when props change or invalidate() is called -->
</Application>
```

When mutating pixi objects directly, call `invalidate()`:

```svelte
<script>
  import { getRenderer, onTick } from 'svelte-pixi'
  const { invalidate } = getRenderer()

  let sprite
  onTick((ticker) => {
    if (sprite && needsUpdate) {
      sprite.x += 1
      invalidate()
    }
  })
</script>
<Sprite bind:instance={sprite} />
```

Every SveltePixi component auto-triggers invalidate on prop changes.

## Reducing Bundle Size

```svelte
<script>
  // Import ONLY extensions you need BEFORE svelte-pixi
  import 'pixi.js/app'
  import 'pixi.js/graphics'
  import 'pixi.js/text'

  import { Application } from 'svelte-pixi'
</script>

<Application skipExtensionImports width={800} height={600}>
  ...
</Application>
```

## Animation with svelte/motion

Props are reactive — drive them with `spring` or `tweened`:

```svelte
<script>
  import { spring } from 'svelte/motion'
  import { Sprite } from 'svelte-pixi'

  const pos = spring({ x: 200, y: 200 }, { stiffness: 0.2, damping: 0.4 })

  function handleDragStart(e) {
    // ...
  }
  function handleDrag(e) {
    if (dragging) pos.update(() => ({ x: e.data.global.x, y: e.data.global.y }), { hard: true })
  }
  function handleDragEnd() {
    pos.set({ x: 200, y: 200 }, { soft: 1 })
  }
</script>

<Sprite x={$pos.x} y={$pos.y}
  eventMode="static" cursor="pointer"
  onpointerdown={handleDragStart}
  onglobalpointermove={handleDrag}
  onpointerup={handleDragEnd}
  onpointerupoutside={handleDragEnd}
/>
```

## Masks

```svelte
<script>
  import { Graphics } from 'svelte-pixi'
  let mask
</script>

<Graphics bind:instance={mask} x={100} y={100}
  draw={(g) => { g.rect(0, 0, 200, 200).fill('black') }} />

<Graphics {mask}
  draw={(g) => { g.rect(0, 0, 1000, 1000).fill('green') }} />

<!-- Inverse mask -->
<Graphics mask={{ mask, inverse: true }}
  draw={(g) => { g.rect(0, 0, 1000, 1000).fill('red') }} />
```

## Binding / Tracking Instance Props

SveltePixi components don't support `bind:x` for pixi properties. Use `tick()`
to sync instance ↔ state:

```svelte
<script>
  import { Graphics, tick, onTick } from 'svelte-pixi'
  let instance

  let x = tick(() => instance?.x ?? 360)
  let y = tick(() => instance?.y ?? 200)

  onTick((ticker) => {
    instance.x = 360 + Math.cos(ticker.lastTime / 1000) * 50
    // $x auto-updates on next tick
  })
</script>

<Graphics bind:instance x={$x} y={$y}
  draw={(g) => { g.circle(0, 0, 50).fill(0xde3249) }} />
```

## PointLike Type

Props that accept points (`anchor`, `pivot`, `scale`, `position`, `skew`) accept
multiple formats:

```typescript
type PointLike = number | [number, number] | { x: number; y: number } | PIXI.Point

// All equivalent:
anchor={0.5}
anchor={[0.5, 0.5]}
anchor={{ x: 0.5, y: 0.5 }}
anchor={new PIXI.Point(0.5, 0.5)}
```

## Performance Escape Hatches

SveltePixi components are fine for < ~1000 objects. Beyond that:

1. **Drop to raw PixiJS**: Use `<Container bind:instance>` as mount point,
   create objects imperatively
2. **ParticleContainer**: For thousands of uniform sprites
3. **RenderGroups**: `isRenderGroup={true}` on Container for
   independently-transforming subtrees
4. **CacheAsTexture**: `cacheAsTexture={true}` to flatten static subtrees
5. **render="demand"**: Skip frames when nothing changed
