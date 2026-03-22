# PixiJS Ecosystem & Patterns

## Contents

- Ecosystem Libraries (@pixi/layout, @pixi/ui, pixi-filters, Sound, AssetPack)
- Extensions System (architecture, creating custom extensions)
- Responsive / Resize Patterns
- Viewport / Pan / Zoom Patterns
- Custom UI Patterns (without @pixi/ui)

---

## @pixi/layout — Flexbox for PixiJS (v3)

Yoga-powered flexbox layout. CSS-like responsive positioning for PixiJS objects.
Opt-in per container.

**Install**: `npm install @pixi/layout`

**Critical**: Import `@pixi/layout` BEFORE creating your pixi application to
ensure mixins are applied.

```ts
import "@pixi/layout";
import { Application, Assets, Container, Sprite } from "pixi.js";

const app = new Application();
await app.init({ background: "#1099bb", resizeTo: window });

// Enable layout on stage
app.stage.layout = {
  width: app.screen.width,
  height: app.screen.height,
  justifyContent: "center",
  alignItems: "center",
};

// Container with flexbox
const toolbar = new Container({
  layout: {
    width: "80%",
    height: 60,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 10,
    padding: 10,
    backgroundColor: 0x333333,
    borderRadius: 8,
  },
});

// Children opt-in to layout
const button = new Sprite({ texture, layout: true }); // intrinsic sizing
const label = new Text({ text: "Save", layout: true });
toolbar.addChild(button, label);

app.stage.addChild(toolbar);
```

### Key concepts

- **Opt-in**: Only containers/children with `layout` property participate
- **Children without layout** behave as normal PixiJS objects
- **Intrinsic sizing**: `layout: true` is shorthand for
  `{ width: 'intrinsic', height: 'intrinsic' }`
- **Percentage values**: `width: '80%'`, `height: '50%'`
- **`objectFit`**: `'fill'`, `'contain'`, `'cover'`, `'none'`, `'scale-down'`
- **`objectPosition`**: Fine-tune content alignment within layout bounds
- **`overflow: 'scroll'`**: Scrollable containers
- **`backgroundColor`**, **`borderRadius`**: Web-style box styling
- **`transformOrigin`**: For rotation/scale within layout box (replaces
  anchor/pivot when layout enabled)
- **anchor/pivot ignored** when layout is enabled — use transformOrigin instead

### LayoutContainer and re-exported components

For correct intrinsic sizing, use re-exports from `@pixi/layout/components`:

```ts
import { LayoutContainer } from "@pixi/layout/components";
import { Graphics, Sprite, Text } from "@pixi/layout/components";

const panel = new LayoutContainer({
  layout: {
    width: 500,
    height: 300,
    flexWrap: "wrap",
    justifyContent: "center",
    alignContent: "center",
    backgroundColor: 0x222222,
    borderRadius: 10,
  },
});
```

### Supported flexbox properties

All standard Yoga/CSS flexbox properties: `flexDirection`, `justifyContent`,
`alignItems`, `alignContent`, `flexWrap`, `gap`, `flexGrow`, `flexShrink`,
`flexBasis`, `alignSelf`, `padding`, `margin`, `position`
(`relative`/`absolute`), `top`/`right`/`bottom`/`left`,
`minWidth`/`maxWidth`/`minHeight`/`maxHeight`.

### Responsive resize

```ts
// Update layout dimensions when window resizes
app.renderer.on("resize", () => {
  app.stage.layout = {
    ...app.stage.layout,
    width: app.screen.width,
    height: app.screen.height,
  };
});
```

---

## @pixi/ui — Pre-built UI Components

Interactive UI widgets for PixiJS.

**Install**: `npm install @pixi/ui`

### Available components

| Component     | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `Button`      | Click/tap button with states (default, hover, pressed, disabled) |
| `FancyButton` | Button with text, icon, and background sprite states             |
| `Slider`      | Draggable slider with fill and handle                            |
| `ProgressBar` | Fill-based progress indicator                                    |
| `ScrollBox`   | Scrollable container with optional scrollbar                     |
| `List`        | Vertical/horizontal list with spacing                            |
| `RadioGroup`  | Mutually exclusive option selection                              |
| `CheckBox`    | Toggle checkbox                                                  |
| `Switch`      | On/off toggle switch                                             |
| `Input`       | Text input field (uses DOMContainer internally)                  |

### Basic usage

```ts
import { FancyButton, ScrollBox, Slider } from "@pixi/ui";

const button = new FancyButton({
  defaultView: new Graphics().roundRect(0, 0, 150, 50, 8).fill(0x3498db),
  hoverView: new Graphics().roundRect(0, 0, 150, 50, 8).fill(0x2980b9),
  pressedView: new Graphics().roundRect(0, 0, 150, 50, 8).fill(0x1a5276),
  text: new Text({ text: "Click Me", style: { fill: "white" } }),
});
button.onPress.connect(() => console.log("clicked"));

const slider = new Slider({
  bg: new Graphics().roundRect(0, 0, 300, 8, 4).fill(0x555555),
  fill: new Graphics().roundRect(0, 0, 300, 8, 4).fill(0x3498db),
  slider: new Graphics().circle(0, 0, 12).fill(0xffffff),
  min: 0,
  max: 100,
  value: 50,
});
slider.onChange.connect((value) => console.log(value));

const scrollBox = new ScrollBox({
  width: 400,
  height: 300,
  items: myItemArray, // array of Container objects
});
```

### Combining @pixi/ui with @pixi/layout

```ts
import "@pixi/layout";
import { FancyButton } from "@pixi/ui";

const toolbar = new Container({
  layout: { flexDirection: "row", gap: 8, padding: 10 },
});

const btn1 = new FancyButton({/* ... */});
btn1.layout = true; // opt into flexbox
toolbar.addChild(btn1);
```

---

## Extensions System

PixiJS v8 is built entirely on extensions. Every system is modular and
registered via `extensions.add()`.

### Using extensions

```ts
import { CullerPlugin, extensions } from "pixi.js";
extensions.add(CullerPlugin); // opt-in to automatic culling
```

### Extension imports for tree-shaking

```ts
// Default extensions (imported automatically unless skipExtensionImports is set):
import "pixi.js/accessibility";
import "pixi.js/app";
import "pixi.js/events";
import "pixi.js/filters";
import "pixi.js/sprite-tiling";
import "pixi.js/text";
import "pixi.js/text-bitmap";
import "pixi.js/text-html";
import "pixi.js/graphics";
import "pixi.js/mesh";
import "pixi.js/sprite-nine-slice";

// NOT default — must import manually:
import "pixi.js/advanced-blend-modes";
import "pixi.js/unsafe-eval"; // for CSP-restricted environments
import "pixi.js/prepare"; // pre-upload textures to GPU
import "pixi.js/math-extras";
import "pixi.js/dds";
import "pixi.js/ktx";
import "pixi.js/ktx2";
import "pixi.js/basis";
```

### Creating custom extensions

```ts
import { extensions, ExtensionType } from "pixi.js";

const myLoader = {
  extension: {
    type: ExtensionType.LoadParser,
    name: "my-loader",
  },
  test(url) {
    return url.endsWith(".custom");
  },
  async load(url) {/* load logic */},
};

extensions.add(myLoader);
```

### Extension types

| Type                                         | Purpose                                            |
| -------------------------------------------- | -------------------------------------------------- |
| `ExtensionType.Application`                  | App lifecycle plugins (TickerPlugin, ResizePlugin) |
| `ExtensionType.LoadParser`                   | Asset loader for custom formats                    |
| `ExtensionType.ResolveParser`                | URL resolution for assets                          |
| `ExtensionType.CacheParser`                  | Caching behavior                                   |
| `ExtensionType.DetectionParser`              | Format support detection                           |
| `ExtensionType.Environment`                  | Platform-specific behavior (browser, web worker)   |
| `ExtensionType.WebGLSystem` / `WebGPUSystem` | Renderer systems                                   |
| `ExtensionType.BlendMode`                    | Custom blend modes                                 |

---

## Responsive / Resize Patterns

### resizeTo (built-in)

```ts
await app.init({ resizeTo: window });
// or target specific element:
await app.init({ resizeTo: document.getElementById("canvas-wrapper") });
```

ResizePlugin is automatically installed. Calls `app.resize()` on resize events
(throttled via rAF).

### Manual responsive scaling (design-size → screen-size)

```ts
const DESIGN_W = 1280;
const DESIGN_H = 720;

function updateScale() {
  const scale = Math.min(
    app.screen.width / DESIGN_W,
    app.screen.height / DESIGN_H,
  );
  app.stage.scale.set(scale);
  app.stage.position.set(
    (app.screen.width - DESIGN_W * scale) / 2,
    (app.screen.height - DESIGN_H * scale) / 2,
  );
}

updateScale();
app.renderer.on("resize", updateScale);
```

### Handling DPI / retina

```ts
await app.init({
  resolution: window.devicePixelRatio || 1,
  autoDensity: true, // CSS pixels match logical pixels
  resizeTo: window,
});
```

---

## Viewport / Pan / Zoom Patterns

PixiJS doesn't include a viewport — build it with a Container + pointer events.

### Basic pan + wheel zoom

```ts
const viewport = new Container({ isRenderGroup: true });
app.stage.addChild(viewport);

let dragging = false;
let dragStart = { x: 0, y: 0 };

app.stage.eventMode = "static";
app.stage.hitArea = app.screen;

app.stage.on("pointerdown", (e) => {
  dragging = true;
  dragStart = { x: e.global.x - viewport.x, y: e.global.y - viewport.y };
});

app.stage.on("pointermove", (e) => {
  if (dragging) {
    viewport.x = e.global.x - dragStart.x;
    viewport.y = e.global.y - dragStart.y;
  }
});

app.stage.on("pointerup", () => {
  dragging = false;
});
app.stage.on("pointerupoutside", () => {
  dragging = false;
});

// Wheel zoom
app.canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const factor = e.deltaY > 0 ? 0.9 : 1.1;
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  // Zoom toward cursor
  viewport.x = mouseX - (mouseX - viewport.x) * factor;
  viewport.y = mouseY - (mouseY - viewport.y) * factor;
  viewport.scale.x *= factor;
  viewport.scale.y *= factor;
}, { passive: false });
```

### Zoom to fit content

```ts
function zoomToFit(viewport, contentBounds, screenW, screenH, padding = 20) {
  const scale = Math.min(
    (screenW - padding * 2) / contentBounds.width,
    (screenH - padding * 2) / contentBounds.height,
  );
  viewport.scale.set(scale);
  viewport.x = (screenW - contentBounds.width * scale) / 2 -
    contentBounds.x * scale;
  viewport.y = (screenH - contentBounds.height * scale) / 2 -
    contentBounds.y * scale;
}
```

---

## Custom UI Without @pixi/ui

For simple UI needs, build directly with Graphics + Text + events:

### Interactive button

```ts
function createButton(label, x, y, onClick) {
  const container = new Container();
  container.eventMode = "static";
  container.cursor = "pointer";

  const bg = new Graphics().roundRect(0, 0, 120, 40, 6).fill(0x3498db);
  const text = new Text({
    text: label,
    style: { fill: "white", fontSize: 14 },
    anchor: 0.5,
    x: 60,
    y: 20,
  });

  container.addChild(bg, text);
  container.position.set(x, y);

  container.on("pointerover", () => {
    bg.tint = 0xdddddd;
  });
  container.on("pointerout", () => {
    bg.tint = 0xffffff;
  });
  container.on("pointerdown", () => {
    bg.tint = 0xaaaaaa;
  });
  container.on("pointerup", () => {
    bg.tint = 0xdddddd;
    onClick();
  });

  return container;
}
```

### Scrollable panel (manual)

```ts
const panel = new Container();
const mask = new Graphics().rect(0, 0, width, height).fill(0xffffff);
panel.mask = mask;
panel.addChild(mask);

const content = new Container();
panel.addChild(content);
// Add items to content...

// Scroll with wheel
app.canvas.addEventListener("wheel", (e) => {
  content.y = Math.max(
    Math.min(0, content.y - e.deltaY),
    -(content.height - height),
  );
});
```

---

## Other Ecosystem Libraries

| Package           | Install                 | Purpose                                        |
| ----------------- | ----------------------- | ---------------------------------------------- |
| `@pixi/layout`    | `npm i @pixi/layout`    | Yoga flexbox layout                            |
| `@pixi/ui`        | `npm i @pixi/ui`        | Pre-built UI components                        |
| `pixi-filters`    | `npm i pixi-filters`    | Community filter effects (glow, outline, etc.) |
| `@pixi/sound`     | `npm i @pixi/sound`     | WebAudio playback with filters                 |
| `@pixi/assetpack` | `npm i @pixi/assetpack` | Build-time asset optimization                  |
| `pixi.js/gif`     | (bundled)               | GifSprite for animated GIFs                    |
| `@pixi/devtools`  | browser extension       | Performance debugging                          |
