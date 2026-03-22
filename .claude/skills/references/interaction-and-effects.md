# Accessibility

PixiJS includes built-in accessibility support through a DOM-based overlay
system that integrates with screen readers, keyboard navigation, and other
assistive technologies. It uses `` overlays to describe visual elements to
screen readers

:::info Accessibility is opt-in to reduce bundle size and must be explicitly
enabled. :::

```ts
import "pixi.js/accessibility";
import { Container } from "pixi.js";

const button = new Container();
button.accessible = true;
```

## **How It Works**

PixiJS places DOM `` elements over your canvas, aligned to the bounds of
accessible objects. These elements:

- Can receive focus via keyboard (`tabIndex`)
- Announce `accessibleTitle` or `accessibleHint` to screen readers
- Dispatch `click`, `mouseover`, `mouseout` events as Pixi pointer events
- Use `aria-live` and `aria-label` where appropriate

## Enabling the System

To enable accessibility, you must import the module before creating your
renderer:

```ts
import "pixi.js/accessibility";
```

PixiJS automatically installs the `AccessibilitySystem` onto your renderer. You
can configure how and when it's activated.

## **Configuration Options**

You can customize when and how the accessibility system activates by passing
options to the `Application` constructor:

```ts
const app = new Application({
  accessibilityOptions: {
    enabledByDefault: true, // Enable on startup
    activateOnTab: false, // Disable auto-activation via tab
    deactivateOnMouseMove: false, // Keep system active with mouse use
    debug: true, // Show div overlays for debugging
  },
});
```

Or programmatically enable/disable the system:

```ts
app.renderer.accessibility.setAccessibilityEnabled(true);
```

## **Creating Accessible Objects**

To mark a display object as accessible and add it to the accessibility system,
set the `accessible` property to `true`. This will create a `` overlay that
screen readers can interact with.

```ts
const button = new Container();
button.accessible = true;

app.stage.addChild(button);
```

### **Properties for Accessible Containers**

There are several properties you can set on accessible containers to customize
their behavior:

| Property                  | Description                                                      |
| ------------------------- | ---------------------------------------------------------------- |
| `accessible`              | Enables accessibility for the object                             |
| `accessibleTitle`         | Sets the `title` for screen readers                              |
| `accessibleHint`          | Sets the `aria-label`                                            |
| `accessibleText`          | Alternative inner text for the div                               |
| `accessibleType`          | Tag name used for the shadow element (`'button'`, `'div'`, etc.) |
| `accessiblePointerEvents` | CSS `pointer-events` value (`'auto'`, `'none'`, etc.)            |
| `tabIndex`                | Allows focus with keyboard navigation                            |
| `accessibleChildren`      | Whether children of this container are accessible                |

---

## **API Reference**

- [Overview](https://pixijs.download/release/docs/accessibility.html)
- [AccessibilitySystem](https://pixijs.download/release/docs/accessibility.AccessibilitySystem.html)
- [AccessibleOptions](https://pixijs.download/release/docs/accessibility.AccessibleOptions.html)

---

## Color

# Color

The `Color` class in PixiJS is a flexible utility for representing colors. It is
used throughout the rendering pipeline for things like tints, fills, strokes,
gradients, and more.

```ts
import { Color, Graphics, Sprite, Texture } from "pixi.js";

const red = new Color("red"); // Named color
const green = new Color(0x00ff00); // Hex
const blue = new Color("#0000ff"); // Hex string
const rgba = new Color({ r: 255, g: 0, b: 0, a: 0.5 }); // RGBA object

console.log(red.toArray()); // [1, 0, 0, 1]
console.log(green.toHex()); // "#00ff00"

const sprite = new Sprite(Texture.WHITE);
sprite.tint = red; // Works directly with a Color instance
```

## Using `Color` and `ColorSource`

PixiJS supports many color formats through the `ColorSource` type:

- Color names: `'red'`, `'white'`, `'blue'`, etc.
- Hex integers: `0xffcc00`
- Hex strings: `'ffcc00'`, `'#f00'`, `'0xffcc00ff'`
- RGB(A) objects: `{ r: 255, g: 0, b: 0 }`, `{ r: 255, g: 0, b: 0, a: 0.5 }`
- RGB(A) strings: `'rgb(255,0,0)'`, `'rgba(255,0,0,0.5)'`
- RGB(A) arrays: `[1, 0, 0]`, `[1, 0, 0, 0.5]`
- Typed arrays: `Uint8Array`, `Float32Array`
- HSL/HSV objects and strings
- `Color` instances

Whenever you see a color-related property (e.g., `fill`, `tint`, `stroke`), you
can use any of these formats. The library will automatically convert them to the
appropriate format internally.

```ts
import { Graphics, Sprite, Texture } from "pixi.js";

const sprite = new Sprite(Texture.WHITE);
sprite.tint = "red"; // converted internally

const graphics = new Graphics();
graphics.fill({ color: "#00ff00" }); // Also converted internally
```

---

## API Reference

- [Color](https://pixijs.download/release/docs/color.Color.html)

---

## Events / Interaction

# Events / Interaction

PixiJS is primarily a rendering library, but it provides a flexible and
performant event system designed for both mouse and touch input. This system
replaces the legacy `InteractionManager` from previous versions with a unified,
DOM-like federated event model.

```ts
const sprite = new Sprite(texture);
sprite.eventMode = "static";
sprite.on("pointerdown", () => {
  console.log("Sprite clicked!");
});
```

## Event Modes

To use the event system, set the `eventMode` of a `Container` (or its subclasses
like `Sprite`) and subscribe to event listeners.

The `eventMode` property controls how an object interacts with the event system:

| Mode      | Description                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------ |
| `none`    | Ignores all interaction events, including children. Optimized for non-interactive elements.                              |
| `passive` | _(default)_ Ignores self-hit testing and does not emit events, but interactive children still receive events.            |
| `auto`    | Participates in hit testing only if a parent is interactive. Does not emit events.                                       |
| `static`  | Emits events and is hit tested. Suitable for non-moving interactive elements like buttons.                               |
| `dynamic` | Same as `static`, but also receives synthetic events when the pointer is idle. Suitable for animating or moving targets. |

## Event Types

PixiJS supports a rich set of DOM-like event types across mouse, touch, and
pointer input. Below is a categorized list.

### Pointer Events (Recommended for general use)

| Event Type          | Description                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- |
| `pointerdown`       | Fired when a pointer (mouse, pen, or touch) is pressed on a display object.        |
| `pointerup`         | Fired when the pointer is released over the display object.                        |
| `pointerupoutside`  | Fired when the pointer is released outside the object that received `pointerdown`. |
| `pointermove`       | Fired when the pointer moves over the display object.                              |
| `pointerover`       | Fired when the pointer enters the boundary of the display object.                  |
| `pointerout`        | Fired when the pointer leaves the boundary of the display object.                  |
| `pointerenter`      | Fired when the pointer enters the display object (does not bubble).                |
| `pointerleave`      | Fired when the pointer leaves the display object (does not bubble).                |
| `pointercancel`     | Fired when the pointer interaction is canceled (e.g. touch lost).                  |
| `pointertap`        | Fired when a pointer performs a quick tap.                                         |
| `globalpointermove` | Fired on every pointer move, regardless of whether any display object is hit.      |

### Mouse Events (Used for mouse-specific input)

| Event Type        | Description                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------- |
| `mousedown`       | Fired when a mouse button is pressed on a display object.                                   |
| `mouseup`         | Fired when a mouse button is released over the object.                                      |
| `mouseupoutside`  | Fired when a mouse button is released outside the object that received `mousedown`.         |
| `mousemove`       | Fired when the mouse moves over the display object.                                         |
| `mouseover`       | Fired when the mouse enters the display object.                                             |
| `mouseout`        | Fired when the mouse leaves the display object.                                             |
| `mouseenter`      | Fired when the mouse enters the object, does not bubble.                                    |
| `mouseleave`      | Fired when the mouse leaves the object, does not bubble.                                    |
| `click`           | Fired when a mouse click (press and release) occurs on the object.                          |
| `rightdown`       | Fired when the right mouse button is pressed on the display object.                         |
| `rightup`         | Fired when the right mouse button is released over the object.                              |
| `rightupoutside`  | Fired when the right mouse button is released outside the object that received `rightdown`. |
| `rightclick`      | Fired when a right mouse click (press and release) occurs on the object.                    |
| `globalmousemove` | Fired on every mouse move, regardless of display object hit.                                |
| `wheel`           | Fired when the mouse wheel is scrolled while over the display object.                       |

### Touch Events

| Event Type        | Description                                                                           |
| ----------------- | ------------------------------------------------------------------------------------- |
| `touchstart`      | Fired when a new touch point is placed on a display object.                           |
| `touchend`        | Fired when a touch point is lifted from the display object.                           |
| `touchendoutside` | Fired when a touch point ends outside the object that received `touchstart`.          |
| `touchmove`       | Fired when a touch point moves across the display object.                             |
| `touchcancel`     | Fired when a touch interaction is canceled (e.g. device gesture).                     |
| `tap`             | Fired when a touch point taps the display object.                                     |
| `globaltouchmove` | Fired on every touch move, regardless of whether a display object is under the touch. |

### Global Events

In previous versions of PixiJS, events such as `pointermove`, `mousemove`, and
`touchmove` were fired when any move event was captured by the canvas, even if
the pointer was not over a display object. This behavior changed in v8 and now
these events are fired only when the pointer is over a display object.

To maintain the old behavior, you can use the `globalpointermove`,
`globalmousemove`, and `globaltouchmove` events. These events are fired on every
pointer/touch move, regardless of whether any display object is hit.

```ts
const sprite = new Sprite(texture);
sprite.eventMode = "static";
sprite.on("globalpointermove", (event) => {
  console.log("Pointer moved globally!", event);
});
```

## How Hit Testing Works

When an input event occurs (mouse move, click, etc.), PixiJS walks the display
tree to find the top-most interactive element under the pointer:

- If `interactiveChildren` is `false` on a `Container`, its children will be
  skipped.
- If a `hitArea` is set, it overrides bounds-based hit testing.
- If `eventMode` is `'none'`, the element and its children are skipped.

Once the top-most interactive element is found, the event is dispatched to it.
If the event bubbles, it will propagate up the display tree. If the event is not
handled, it will continue to bubble up to parent containers until it reaches the
root.

### Custom Hit Area

Custom hit areas can be defined using the `hitArea` property. This property can
be set on any scene object, including `Sprite`, `Container`, and `Graphics`.

Using a custom hit area allows you to define a specific area for interaction,
which can be different from the object's bounding box. It also can improve
performance by reducing the number of objects that need to be checked for
interaction.

```ts
import { Rectangle, Sprite } from "pixi.js";

const sprite = new Sprite(texture);
sprite.hitArea = new Rectangle(0, 0, 100, 100);
sprite.eventMode = "static";
```

## Listening to Events

PixiJS supports both `on()`/`off()` and
`addEventListener()`/`removeEventListener()` and event callbacks
(`onclick: ()=> {}`) for adding and removing event listeners. The `on()` method
is recommended for most use cases as it provides a more consistent API across
different event types used throughout PixiJS.

### Using `on()` (from EventEmitter)

```ts
const eventFn = (e) => console.log("clicked");
sprite.on("pointerdown", eventFn);
sprite.once("pointerdown", eventFn);
sprite.off("pointerdown", eventFn);
```

### Using DOM-style Events

```ts
sprite.addEventListener(
  "click",
  (event) => {
    console.log("Clicked!", event.detail);
  },
  { once: true },
);
```

### Using callbacks

```ts
sprite.onclick = (event) => {
  console.log("Clicked!", event.detail);
};
```

## Checking for Interactivity

You can check if a `Sprite` or `Container` is interactive by using the
`isInteractive()` method. This method returns `true` if the object is
interactive and can receive events.

```ts
if (sprite.isInteractive()) {
  // true if eventMode is static or dynamic
}
```

## Custom Cursors

PixiJS allows you to set a custom cursor for interactive objects using the
`cursor` property. This property accepts a string representing the CSS cursor
type.

```ts
const sprite = new Sprite(texture);
sprite.eventMode = "static";
sprite.cursor = "pointer"; // Set the cursor to a pointer when hovering over the sprite
```

```ts
const sprite = new Sprite(texture);
sprite.eventMode = "static";
sprite.cursor = "url(my-cursor.png), auto"; // Set a custom cursor image
```

### Default Custom Cursors

You can also set default values to be used for all interactive objects.

```ts
// CSS style for icons
const defaultIcon = "url('https://pixijs.com/assets/bunny.png'),auto";
const hoverIcon = "url('https://pixijs.com/assets/bunny_saturated.png'),auto";

// Add custom cursor styles
app.renderer.events.cursorStyles.default = defaultIcon;
app.renderer.events.cursorStyles.hover = hoverIcon;

const sprite = new Sprite(texture);
sprite.eventMode = "static";
sprite.cursor = "hover";
```

---

## API Reference

- [Overview](https://pixijs.download/release/docs/events.html)
- [EventSystem](https://pixijs.download/release/docs/events.EventSystem.html)
- [Cursor](https://pixijs.download/release/docs/events.html#Cursor)
- [EventMode](https://pixijs.download/release/docs/events.html#EventMode)
- [Container](https://pixijs.download/release/docs/scene.Container.html)
- [FederatedEvent](https://pixijs.download/release/docs/events.FederatedEvent.html)
- [FederatedMouseEvent](https://pixijs.download/release/docs/events.FederatedMouseEvent.html)
- [FederatedWheelEvent](https://pixijs.download/release/docs/events.FederatedWheelEvent.html)
- [FederatedPointerEvent](https://pixijs.download/release/docs/events.FederatedPointerEvent.html)

---

## Filters / Blend Modes

# Filters / Blend Modes

PixiJS filters allow you to apply post-processing visual effects to any scene
object and its children. Filters can be used for effects such as blurring, color
adjustments, noise, or custom shader-based operations.

```ts
import { BlurFilter, Sprite } from "pixi.js";

// Apply the filter
sprite.filters = [new BlurFilter({ strength: 8 })];
```

---

## Applying Filters

Applying filters is straightforward. You can assign a filter instance to the
`filters` property of any scene object, such as `Sprite`, `Container`, or
`Graphics`. You can apply multiple filters by passing an array of filter
instances.

```ts
import { BlurFilter, NoiseFilter } from "pixi.js";

sprite.filters = new BlurFilter({ strength: 5 });

sprite.filters = [
  new BlurFilter({ strength: 4 }),
  new NoiseFilter({ noise: 0.2 }),
];
```

:::info Order matters — filters are applied in sequence. :::

---

## Advanced Blend Modes

PixiJS v8 introduces advanced blend modes for filters, allowing for more complex
compositing effects. These blend modes can be used to create unique visual
styles and effects. To use advanced modes like `HARD_LIGHT`, you must manually
import the advanced blend mode extension:

```ts
import "pixi.js/advanced-blend-modes";
import { HardMixBlend } from "pixi.js";

sprite.filters = [new HardMixBlend()];
```

---

## Built-In Filters Overview

PixiJS v8 provides a variety of filters out of the box:

| Filter Class         | Description                                 |
| -------------------- | ------------------------------------------- |
| `AlphaFilter`        | Applies transparency to an object.          |
| `BlurFilter`         | Gaussian blur.                              |
| `ColorMatrixFilter`  | Applies color transformations via a matrix. |
| `DisplacementFilter` | Distorts an object using another texture.   |
| `NoiseFilter`        | Adds random noise for a grainy effect.      |

:::info To explore more community filters, see
[pixi-filters](https://pixijs.io/filters/docs/). :::

**Blend Filters**: Used for custom compositing modes

| Filter Class       | Description                                        |
| ------------------ | -------------------------------------------------- |
| `ColorBurnBlend`   | Darkens the base color to reflect the blend color. |
| `ColorDodgeBlend`  | Brightens the base color.                          |
| `DarkenBlend`      | Retains the darkest color components.              |
| `DivideBlend`      | Divides the base color by the blend color.         |
| `HardMixBlend`     | High-contrast blend.                               |
| `LinearBurnBlend`  | Darkens using linear formula.                      |
| `LinearDodgeBlend` | Lightens using linear formula.                     |
| `LinearLightBlend` | Combination of linear dodge and burn.              |
| `PinLightBlend`    | Selective replacement of colors.                   |
| `SubtractBlend`    | Subtracts the blend color from base.               |

---

## Creating a Custom Filter

To define a custom filter in PixiJS v8, you use `Filter.from()` with shader
programs and GPU resources.

```ts
import { Filter, GlProgram, Texture } from "pixi.js";

const vertex = `
  in vec2 aPosition;
  out vec2 vTextureCoord;

  uniform vec4 uInputSize;
  uniform vec4 uOutputFrame;
  uniform vec4 uOutputTexture;

  vec4 filterVertexPosition( void )
  {
      vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;

      position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
      position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;

      return vec4(position, 0.0, 1.0);
  }

  vec2 filterTextureCoord( void )
  {
      return aPosition * (uOutputFrame.zw * uInputSize.zw);
  }

  void main(void)
  {
      gl_Position = filterVertexPosition();
      vTextureCoord = filterTextureCoord();
  }
`;

const fragment = `
  in vec2 vTextureCoord;
  in vec4 vColor;

  uniform sampler2D uTexture;
  uniform float uTime;

  void main(void)
  {
      vec2 uvs = vTextureCoord.xy;

      vec4 fg = texture2D(uTexture, vTextureCoord);

      fg.r = uvs.y + sin(uTime);

      gl_FragColor = fg;

  }
`;

const customFilter = new Filter({
  glProgram: new GlProgram({
    fragment,
    vertex,
  }),
  resources: {
    timeUniforms: {
      uTime: { value: 0.0, type: "f32" },
    },
  },
});

// Apply the filter
sprite.filters = [customFilter];

// Update uniform
app.ticker.add((ticker) => {
  filter.resources.timeUniforms.uniforms.uTime += 0.04 * ticker.deltaTime;
});
```

:::info **Tip** Shaders must be WebGL- or WebGPU-compatible. For dual-renderer
support, include a `gpuProgram`. :::

---

## API Reference

- [Overview](https://pixijs.download/release/docs/filters.html)
- [Filter](https://pixijs.download/release/docs/filters.Filter.html)

---

## Math

# Math

PixiJS includes a several math utilities for 2D transformations, geometry, and
shape manipulation. This guide introduces the most important classes and their
use cases, including optional advanced methods enabled via `math-extras`.

## Matrix

The `Matrix` class represents a 2D affine transformation matrix. It is used
extensively for transformations such as scaling, translation, and rotation.

```ts
import { Matrix, Point } from "pixi.js";

const matrix = new Matrix();
matrix.translate(10, 20).scale(2, 2);

const point = new Point(5, 5);
const result = matrix.apply(point); // result is (20, 30)
```

---

## Point and ObservablePoint

### `Point`

The Point object represents a location in a two-dimensional coordinate system,
where `x` represents the position on the horizontal axis and `y` represents the
position on the vertical axis. Many Pixi functions accept the `PointData` type
as an alternative to `Point`, which only requires `x` and `y` properties.

```ts
import { Point } from "pixi.js";
const point = new Point(5, 10);

point.set(20, 30); // set x and y
```

### `ObservablePoint`

Extends `Point` and triggers a callback when its values change. Used internally
for reactive systems like position and scale updates.

```ts
import { ObservablePoint, Point } from "pixi.js";

const observer = {
  _onUpdate: (point) => {
    console.log(`Point updated to: (${point.x}, ${point.y})`);
  },
};
const reactive = new ObservablePoint(observer, 1, 2);
reactive.set(3, 4); // triggers call to _onUpdate
```

---

## Shapes

PixiJS includes several 2D shapes, used for hit testing, rendering, and geometry
computations.

### `Rectangle`

Axis-aligned rectangle defined by `x`, `y`, `width`, and `height`.

```ts
import { Rectangle } from "pixi.js";

const rect = new Rectangle(10, 10, 100, 50);
rect.contains(20, 20); // true
```

### `Circle`

Defined by `x`, `y` (center) and `radius`.

```ts
import { Circle } from "pixi.js";

const circle = new Circle(50, 50, 25);
circle.contains(50, 75); // true
```

### `Ellipse`

Similar to `Circle`, but supports different width and height (radii).

```ts
import { Ellipse } from "pixi.js";

const ellipse = new Ellipse(0, 0, 20, 10);
ellipse.contains(5, 0); // true
```

### `Polygon`

Defined by a list of points. Used for complex shapes and hit testing.

```ts
import { Polygon } from "pixi.js";

const polygon = new Polygon([0, 0, 100, 0, 100, 100, 0, 100]);
polygon.contains(50, 50); // true
```

### `RoundedRectangle`

Rectangle with rounded corners, defined by a radius.

```ts
import { RoundedRectangle } from "pixi.js";

const roundRect = new RoundedRectangle(0, 0, 100, 100, 10);
roundRect.contains(10, 10); // true
```

### `Triangle`

A convenience wrapper for defining triangles with three points.

```ts
import { Triangle } from "pixi.js";

const triangle = new Triangle(0, 0, 100, 0, 50, 100);
triangle.contains(50, 50); // true
```

---

## Optional: `math-extras`

Importing `pixi.js/math-extras` extends `Point` and `Rectangle` with additional
vector and geometry utilities.

### To enable:

```ts
import "pixi.js/math-extras";
```

### Enhanced `Point` Methods

| Method                          | Description                                                  |
| ------------------------------- | ------------------------------------------------------------ |
| `add(other[, out])`             | Adds another point to this one.                              |
| `subtract(other[, out])`        | Subtracts another point from this one.                       |
| `multiply(other[, out])`        | Multiplies this point with another point component-wise.     |
| `multiplyScalar(scalar[, out])` | Multiplies the point by a scalar.                            |
| `dot(other)`                    | Computes the dot product of two vectors.                     |
| `cross(other)`                  | Computes the scalar z-component of the 3D cross product.     |
| `normalize([out])`              | Returns a normalized (unit-length) vector.                   |
| `magnitude()`                   | Returns the Euclidean length.                                |
| `magnitudeSquared()`            | Returns the squared length (more efficient for comparisons). |
| `project(onto[, out])`          | Projects this point onto another vector.                     |
| `reflect(normal[, out])`        | Reflects the point across a given normal.                    |

### Enhanced `Rectangle` Methods

| Method                       | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `containsRect(other)`        | Returns true if this rectangle contains the other.    |
| `equals(other)`              | Checks if all properties are equal.                   |
| `intersection(other[, out])` | Returns a new rectangle representing the overlap.     |
| `union(other[, out])`        | Returns a rectangle that encompasses both rectangles. |

---

## API Reference

- [Overview](https://pixijs.download/release/docs/maths.html)
- [Matrix](https://pixijs.download/release/docs/maths.Matrix.html)
- [Point](https://pixijs.download/release/docs/maths.Point.html)
- [ObservablePoint](https://pixijs.download/release/docs/maths.ObservablePoint.html)
- [Rectangle](https://pixijs.download/release/docs/maths.Rectangle.html)
- [Circle](https://pixijs.download/release/docs/maths.Circle.html)
- [Ellipse](https://pixijs.download/release/docs/maths.Ellipse.html)
- [Polygon](https://pixijs.download/release/docs/maths.Polygon.html)
- [RoundedRectangle](https://pixijs.download/release/docs/maths.RoundedRectangle.html)
- [Triangle](https://pixijs.download/release/docs/maths.Triangle.html)

---

## Textures
