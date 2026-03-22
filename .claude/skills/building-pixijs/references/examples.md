# PixiJS v8 — Patterns & Examples (from official docs, v8.17.1)

Real working code patterns from the official PixiJS examples. Use these as
templates.

## Contents

- Application Bootstrap
- Asset Loading (single, multiple, bundles, SVG)
- Graphics API (shapes, lines, beziers, arcs, holes, gradients, texture fills,
  SVG parsing, pixel lines, dynamic redraw)
- Events & Interaction (click, drag, pointer follow)
- Masks (basic, inverse, blur spotlight)
- Filters (Blur, ColorMatrix, Displacement, custom GLSL shader)
- Performance Patterns (RenderGroup, CacheAsTexture, ParticleContainer)
- RenderLayer (UI above filtered content)
- Text (basic, tagged, BitmapText, SplitText, text with filters)
- Mesh & Shaders (MeshPlane, MeshRope, PerspectiveMesh, custom geometry +
  GLSL/WGSL)
- AnimatedSprite, NineSliceSprite, TilingSprite
- RenderTexture
- DOMContainer (HTML in scene graph)
- GSAP Integration (tween, timeline, stagger, quickTo, physics)
- Blend Modes, Canvas Renderer, OffscreenCanvas

## Application Bootstrap

```js
import { Application, Assets, Sprite } from "pixi.js";

const app = new Application();
await app.init({ background: "#1099bb", resizeTo: window });
document.body.appendChild(app.canvas);
```

## Asset Loading

### Single asset

```js
const texture = await Assets.load("https://example.com/image.png");
const sprite = new Sprite(texture);
```

### Multiple assets

```js
Assets.add({ alias: "flower", src: "/assets/flower.png" });
Assets.add({ alias: "egg", src: "/assets/egg.png" });
const textures = await Assets.load(["flower", "egg"]);
// textures.flower, textures.egg
```

### Bundle loading with background preload

```js
const manifest = {
  bundles: [
    { name: "load-screen", assets: [{ alias: "logo", src: "/logo.png" }] },
    { name: "game", assets: [{ alias: "hero", src: "/hero.png" }] },
  ],
};
await Assets.init({ manifest });
Assets.backgroundLoadBundle(["load-screen", "game"]);

const loadAssets = await Assets.loadBundle("load-screen");
// Later, instant because already background-loaded:
const gameAssets = await Assets.loadBundle("game");
```

### SVG loading (as graphics context or texture)

```js
// As texture (rasterized)
const tex = await Assets.load({ src: "/tiger.svg" });

// As GraphicsContext (vector, scalable)
const ctx = await Assets.load({
  src: "/tiger.svg",
  data: { parseAsGraphicsContext: true },
});
const graphics = new Graphics(ctx);
```

## Graphics API (v8 — chained, no beginFill/endFill)

### Basic shapes

```js
const g = new Graphics();

g.rect(50, 50, 100, 100).fill(0xde3249);
g.rect(200, 50, 100, 100).fill(0x650a5a).stroke({ width: 2, color: 0xfeeb77 });
g.circle(100, 250, 50).fill(0xde3249);
g.ellipse(600, 250, 80, 50).fill(0xaa4f08).stroke({
  width: 2,
  color: 0xffffff,
});
g.roundRect(50, 440, 100, 100, 16).fill({ color: 0x650a5a, alpha: 0.25 })
  .stroke({ width: 2, color: 0xff00ff });
g.star(360, 370, 5, 50).fill(0x35cc5a).stroke({ width: 2, color: 0xffffff });
g.poly([600, 370, 700, 460, 780, 420, 730, 570, 590, 520]).fill(0x3500fa);
```

### Lines and paths

```js
g.moveTo(50, 350).lineTo(250, 350).lineTo(100, 400).lineTo(50, 350)
  .fill(0xff3300).stroke({ width: 4, color: 0xffd900 });
```

### Bezier curves and arcs

```js
g.bezierCurveTo(100, 200, 200, 200, 240, 100).stroke({
  width: 5,
  color: 0xaa0000,
});
g.arc(600, 100, 50, Math.PI, 2 * Math.PI).stroke({ width: 5, color: 0xaa00bb });
```

### Holes (cut)

```js
g.rect(350, 350, 150, 150).fill(0x00ff00);
g.circle(375, 375, 25).circle(425, 425, 25).circle(475, 475, 25).cut();
```

### Gradient fills

```js
import { FillGradient } from "pixi.js";
const gradient = new FillGradient(0, 0, 1, 1);
[0xffffff, 0xff0000, 0x00ff00, 0x0000ff].forEach((c, i, arr) => {
  gradient.addColorStop(i / arr.length, c);
});
g.roundRect(0, 0, 150, 150, 50).fill(gradient);
g.roundRect(0, 0, 150, 150, 50).stroke({ width: 20, fill: gradient });
```

### Texture fills

```js
const texture = await Assets.load("/panda.png");
const ctx = new GraphicsContext()
  .circle(0, 0, 120).fill("green")
  .texture(texture, 0xffffff, -texture.width / 2, -texture.height / 2);
const g = new Graphics(ctx);
```

### SVG string parsing

```js
new Graphics().svg(`<svg height="400" width="450">
  <path d="M 100 350 l 150 -300" stroke="red" stroke-width="4"/>
  <circle cx="100" cy="350" r="4" fill="black"/>
</svg>`);
```

### Pixel-perfect lines

```js
g.moveTo(0, 0).lineTo(100, 0).stroke({
  color: 0xffffff,
  pixelLine: true,
  width: 1,
});
```

### Dynamic redraw (clear + redraw per frame)

```js
app.ticker.add(() => {
  thing.clear();
  thing.moveTo(-120 + Math.sin(count) * 20, -100 + Math.cos(count) * 20)
    .lineTo(120 + Math.cos(count) * 20, -100 + Math.sin(count) * 20)
    .fill({ color: 0xffff00, alpha: 0.5 })
    .stroke({ width: 10, color: 0xff0000 });
});
```

## Events & Interaction

### Click

```js
sprite.eventMode = "static";
sprite.cursor = "pointer";
sprite.on("pointerdown", () => {
  sprite.scale.x *= 1.25;
});
```

### Drag

```js
let dragTarget = null;
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;

bunny.on("pointerdown", function () {
  this.alpha = 0.5;
  dragTarget = this;
  app.stage.on("pointermove", onDragMove);
});
app.stage.on("pointerup", () => {
  if (dragTarget) {
    app.stage.off("pointermove", onDragMove);
    dragTarget.alpha = 1;
    dragTarget = null;
  }
});
function onDragMove(event) {
  if (dragTarget) {
    dragTarget.parent.toLocal(event.global, null, dragTarget.position);
  }
}
```

### Pointer follow

```js
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.addEventListener("pointermove", (e) => {
  circle.position.copyFrom(e.global);
});
```

## Masks

### Basic mask

```js
const mask = new Graphics();
mask.position.set(size / 2, size / 2);
container.mask = mask;

// Animate mask shape
app.ticker.add(() => {
  mask.clear();
  mask.moveTo(x1, y1).lineTo(x2, y2).fill({ color: 0xff0000 });
});
```

### Inverse mask

```js
rect.setMask({ mask: masky, inverse: true });
```

### Blur mask (spotlight effect)

```js
const circle = new Graphics().circle(r + blur, r + blur, r).fill(0xff0000);
circle.filters = [new BlurFilter(blur)];
const tex = app.renderer.generateTexture({ target: circle, ... });
const focus = new Sprite(tex);
background.mask = focus;
```

## Filters

### BlurFilter

```js
import { BlurFilter } from "pixi.js";
sprite.filters = [new BlurFilter()];
```

### ColorMatrixFilter

```js
import { ColorMatrixFilter } from "pixi.js";
const filter = new ColorMatrixFilter();
container.filters = [filter];
// Animate: filter.matrix[1] = Math.sin(count) * 3;
```

### DisplacementFilter

```js
import { DisplacementFilter, WRAP_MODES } from "pixi.js";
displacementSprite.texture.baseTexture.wrapMode = WRAP_MODES.REPEAT;
const filter = new DisplacementFilter({
  sprite: displacementSprite,
  scale: { x: 60, y: 120 },
});
flag.filters = [filter];
```

### Custom shader filter (GLSL)

```js
import { Filter, GlProgram } from "pixi.js";
const filter = new Filter({
  glProgram: new GlProgram({ fragment: fragSrc, vertex: vertSrc }),
  resources: {
    timeUniforms: { uTime: { value: 0.0, type: "f32" } },
  },
});
app.ticker.add((t) => {
  filter.resources.timeUniforms.uniforms.uTime += 0.04 * t.deltaTime;
});
```

## Performance Patterns

### RenderGroup (GPU-accelerated container transforms)

```js
const world = new Container({ isRenderGroup: true });
// Add 100k children — moving the container itself is GPU-powered
for (let i = 0; i < 100000; i++) {
  world.addChild(
    new Sprite({
      texture: tex,
      x: Math.random() * 5000,
      y: Math.random() * 5000,
    }),
  );
}
// Pan by updating position — cheap because isRenderGroup
world.x += (-targetX - world.x) * 0.1;
```

### CacheAsTexture (flatten complex static subtrees)

```js
alienContainer.cacheAsTexture(true);
// Toggle: alienContainer.cacheAsTexture(!alienContainer.isCachedAsTexture);
```

### ParticleContainer (10k+ sprites)

```js
// Use regular Container + Sprite for moderate counts
const sprites = new Container();
for (let i = 0; i < 10000; i++) {
  const dude = new Sprite(texture);
  dude.anchor.set(0.5);
  dude.scale.set(0.8 + Math.random() * 0.3);
  dude.x = Math.random() * app.screen.width;
  dude.y = Math.random() * app.screen.height;
  dude.tint = Math.random() * 0x808080;
  dude.direction = Math.random() * Math.PI * 2;
  dude.speed = (2 + Math.random() * 2) * 0.2;
  sprites.addChild(dude);
}
// Update imperatively in ticker
app.ticker.add(() => {
  for (const dude of maggots) {
    dude.x += Math.sin(dude.direction) * dude.speed;
    dude.y += Math.cos(dude.direction) * dude.speed;
    dude.rotation = -dude.direction + Math.PI;
  }
});
```

## RenderLayer (UI above filtered content)

```js
import { RenderLayer } from "pixi.js";

const pondContainer = new Container();
pondContainer.filters = [displacementFilter]; // underwater effect

const uiLayer = new RenderLayer();

for (const fish of fishes) {
  pondContainer.addChild(fish); // fish gets distorted
  uiLayer.attach(fish.ui); // but UI stays crisp above filters
}

app.stage.addChild(pondContainer);
app.stage.addChild(uiLayer); // UI renders on top, unfiltered
```

## Text

### Basic text (options object — v8)

```js
const text = new Text({
  text: "Hello",
  style: { fill: "white", fontSize: 36 },
});
```

### Tagged text (inline styling)

```js
const text = new Text({
  text: "<bold>Bold</bold> and <highlight>highlighted</highlight>",
  style: {
    fontSize: 28,
    fill: "#e0e0e0",
    wordWrap: true,
    wordWrapWidth: 600,
    tagStyles: {
      bold: { fontWeight: "bold", fill: "white" },
      highlight: { fill: "#00d4ff", fontSize: 30 },
    },
  },
});
```

### BitmapText

```js
await Assets.load("/fonts/desyrel.xml");
const bt = new BitmapText({
  text: "Bitmap text!",
  style: { fontFamily: "Desyrel", fontSize: 55, align: "left" },
});
```

### SplitText (per-character animation)

```js
import { SplitText } from "pixi.js";
const splitText = new SplitText({
  text: "Animate me!",
  style: { fontFamily: "Arial", fontSize: 64, fill: "white" },
});
// splitText.chars — array of per-character containers
// Animate with GSAP:
gsap.from(splitText.chars, {
  y: -20,
  alpha: 0,
  stagger: 0.05,
  ease: "back.out",
});
```

### Text with custom filter baked in

```js
const filter = new CartoonTextFilter({ thickness: 7 });
const text = new Text({
  text: "Hello World!",
  style: {
    fontFamily: "Grandstander ExtraBold",
    fontSize: 70,
    fill: 0xffffff,
    filters: [filter], // style-level filter, baked into text texture
  },
});
```

## Mesh & Shaders

### MeshPlane (animated vertices)

```js
const plane = new MeshPlane({ texture, verticesX: 10, verticesY: 10 });
app.ticker.add(() => {
  const { buffer } = plane.geometry.getAttribute("aPosition");
  for (let i = 0; i < buffer.data.length; i++) {
    buffer.data[i] += Math.sin(timer / 10 + i) * 0.5;
  }
  buffer.update();
});
```

### MeshRope (snake/trail)

```js
const points = Array.from(
  { length: 20 },
  (_, i) => new Point(i * ropeLength, 0),
);
const strip = new MeshRope({ texture, points });
app.ticker.add(() => {
  for (let i = 0; i < points.length; i++) {
    points[i].y = Math.sin(i * 0.5 + count) * 30;
    points[i].x = i * ropeLength + Math.cos(i * 0.3 + count) * 20;
  }
});
```

### PerspectiveMesh (3D-like rotation)

```js
const mesh = new PerspectiveMesh({
  texture,
  pivot: { x: w / 2, y: h / 2 },
  x: cx,
  y: cy,
});
mesh.setCorners(x0, y0, x1, y1, x2, y2, x3, y3);
```

### Custom shader (GLSL + WGSL)

```js
import { Geometry, Mesh, Shader } from "pixi.js";

const geometry = new Geometry({
  attributes: {
    aPosition: [-100, -50, 100, -50, 0, 100],
    aColor: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  },
});

const shader = Shader.from({
  gl: { vertex: vertGLSL, fragment: fragGLSL },
  gpu: {
    vertex: { entryPoint: "mainVert", source: wgslSrc },
    fragment: { entryPoint: "mainFrag", source: wgslSrc },
  },
});

const triangle = new Mesh({ geometry, shader });
```

## AnimatedSprite

```js
await Assets.load("/spritesheet/fighter.json");
const frames = [];
for (let i = 0; i < 30; i++) {
  frames.push(Texture.from(`rollSequence00${i < 10 ? `0${i}` : i}.png`));
}
const anim = new AnimatedSprite(frames);
anim.anchor.set(0.5);
anim.animationSpeed = 0.5;
anim.play();
```

## NineSliceSprite

```js
const panel = new NineSliceSprite({
  texture: await Assets.load("/panel.png"),
  leftWidth: 30,
  rightWidth: 30,
  topHeight: 30,
  bottomHeight: 30,
  anchor: 0.5,
  x: app.screen.width / 2,
  y: app.screen.height / 2,
});
panel.width = 500;
panel.height = 300;
```

## TilingSprite

```js
const tiling = new TilingSprite({
  texture,
  width: app.screen.width,
  height: app.screen.height,
});
app.ticker.add(() => {
  tiling.tileScale.x = 2 + Math.sin(count);
  tiling.tilePosition.x += 1;
  tiling.tilePosition.y += 1;
});
```

## RenderTexture

```js
import { RenderTexture } from "pixi.js";
const rt = RenderTexture.create({ width: 300, height: 300 });
const rtSprite = new Sprite(rt);
app.ticker.add(() => {
  app.renderer.render(sourceContainer, { renderTexture: rt });
});
```

## DOMContainer (HTML elements in scene graph)

```js
import { DOMContainer } from "pixi.js";
const el = document.createElement("textarea");
el.value = "Type here...";
const dom = new DOMContainer({ element: el, x: 400, y: 300, anchor: 0.5 });
app.stage.addChild(dom);
// Transforms apply: dom.rotation += 0.01;
```

## GSAP Integration

```js
import { gsap } from "gsap";
// Direct property animation (x, y, rotation, scale, alpha, angle, tint)
gsap.to(sprite, {
  x: 200,
  y: 100,
  rotation: Math.PI,
  duration: 1,
  ease: "back",
});

// Stagger
gsap.from(boxes, {
  y: -100,
  alpha: 0,
  stagger: 0.1,
  duration: 1,
  yoyo: true,
  repeat: -1,
});

// Timeline
const tl = gsap.timeline({ repeat: -1, yoyo: true });
tl.to(box1, { angle: -360, duration: 2 })
  .to(box2, { x: -100, ease: "elastic.out", duration: 1 })
  .to(box3, { angle: 360, x: 100, ease: "expo.out", duration: 2 });

// quickTo (smooth pointer follow)
const xTo = gsap.quickTo(sprite, "x", { duration: 0.6, ease: "power3" });
const yTo = gsap.quickTo(sprite, "y", { duration: 0.6, ease: "power3" });
sprite.on("globalpointermove", (e) => {
  xTo(e.global.x);
  yTo(e.global.y);
});
```

## Blend Modes (advanced — requires import)

```js
import "pixi.js/advanced-blend-modes";
sprite.blendMode = "color-dodge"; // or: screen, darken, lighten, overlay, soft-light, etc.
// Note: WebGL requires `useBackBuffer: true` in app.init()
```

## Canvas Renderer (experimental)

```js
await app.init({
  preference: "canvas",
  background: "#2c3e50",
  resizeTo: window,
});
// app.renderer.name === 'canvas'
```

## OffscreenCanvas

```js
const canvas = document.createElement("canvas");
const view = canvas.transferControlToOffscreen();
await app.init({ view, background: "#1099bb", resizeTo: window });
document.body.appendChild(canvas); // append original canvas, not offscreen
```
