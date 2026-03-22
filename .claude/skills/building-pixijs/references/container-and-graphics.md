# Container

The `Container` class is the foundation of PixiJS's scene graph system.
Containers act as groups of scene objects, allowing you to build complex
hierarchies, organize rendering layers, and apply transforms or effects to
groups of objects.

## What Is a Container?

A `Container` is a general-purpose node that can hold other display objects,
**including other containers**. It is used to structure your scene, apply
transformations, and manage rendering and interaction.

Containers are **not** rendered directly. Instead, they delegate rendering to
their children.

```ts
import { Container, Sprite } from "pixi.js";

const group = new Container();
const sprite = Sprite.from("bunny.png");

group.addChild(sprite);
```

## Managing Children

PixiJS provides a robust API for adding, removing, reordering, and swapping
children in a container:

```ts
const container = new Container();
const child1 = new Container();
const child2 = new Container();

container.addChild(child1, child2);
container.removeChild(child1);
container.addChildAt(child1, 0);
container.swapChildren(child1, child2);
```

You can also remove a child by index or remove all children within a range:

```ts
container.removeChildAt(0);
container.removeChildren(0, 2);
```

To keep a child’s world transform while moving it to another container, use
`reparentChild` or `reparentChildAt`:

```ts
otherContainer.reparentChild(child);
```

### Events

Containers emit events when children are added or removed:

```ts
group.on('childAdded', (child, parent, index) => { ... });
group.on('childRemoved', (child, parent, index) => { ... });
```

### Finding Children

Containers support searching children by `label` using helper methods:

```ts
const child = new Container({ label: "enemy" });
container.addChild(child);
container.getChildByLabel("enemy");
container.getChildrenByLabel(/^enemy/); // all children whose label starts with "enemy"
```

Set `deep = true` to search recursively through all descendants.

```ts
container.getChildByLabel("ui", true);
```

### Sorting Children

Use `zIndex` and `sortableChildren` to control render order within a container:

```ts
child1.zIndex = 1;
child2.zIndex = 10;
container.sortableChildren = true;
```

Call `sortChildren()` to manually re-sort if needed:

```ts
container.sortChildren();
```

:::info Use this feature sparingly, as sorting can be expensive for large
numbers of children. :::

## Optimizing with Render Groups

Containers can be promoted to **render groups** by setting
`isRenderGroup = true` or calling `enableRenderGroup()`.

Use render groups for UI layers, particle systems, or large moving subtrees. See
the [Render Groups guide](../../../concepts/render-groups.md) for more details.

```ts
const uiLayer = new Container({ isRenderGroup: true });
```

## Cache as Texture

The `cacheAsTexture` function in PixiJS is a powerful tool for optimizing
rendering in your applications. By rendering a container and its children to a
texture, `cacheAsTexture` can significantly improve performance for static or
infrequently updated containers.

When you set `container.cacheAsTexture()`, the container is rendered to a
texture. Subsequent renders reuse this texture instead of rendering all the
individual children of the container. This approach is particularly useful for
containers with many static elements, as it reduces the rendering workload.

:::info[Note] `cacheAsTexture` is PixiJS v8's equivalent of the previous
`cacheAsBitmap` functionality. If you're migrating from v7 or earlier, simply
replace `cacheAsBitmap` with `cacheAsTexture` in your code. :::

```ts
const container = new Container();
const sprite = Sprite.from("bunny.png");
container.addChild(sprite);

// enable cache as texture
container.cacheAsTexture();

// update the texture if the container changes
container.updateCacheTexture();

// disable cache as texture
container.cacheAsTexture(false);
```

For more advanced usage, including setting cache options and handling dynamic
content, refer to the [Cache as Texture guide](./cache-as-texture.md).

---

## API Reference

- [Container](https://pixijs.download/release/docs/scene.Container.html)
- [ContainerOptions](https://pixijs.download/release/docs/scene.ContainerOptions.html)
- [RenderContainer](https://pixijs.download/release/docs/scene.RenderContainer.html)

---

## Graphics Fill

# Graphics Fill

If you are new to graphics, please check out the [graphics guide](../graphics)
here. This guide dives a bit deeper into a specific aspect of graphics: how to
fill them! The `fill()` method in PixiJS is particularly powerful, enabling you
to fill shapes with colors, textures, or gradients. Whether you're designing
games, UI components, or creative tools, mastering the `fill()` method is
essential for creating visually appealing and dynamic graphics. This guide
explores the different ways to use the `fill()` method to achieve stunning
visual effects.

:::info Note The `fillStyles` discussed here can also be applied to Text
objects! :::

## Basic Color Fills

When creating a `Graphics` object, you can easily fill it with a color using the
`fill()` method. Here's a simple example:

```ts
const obj = new Graphics()
  .rect(0, 0, 200, 100) // Create a rectangle with dimensions 200x100
  .fill("red"); // Fill the rectangle with a red color
```

![alt text](/assets/guides/components/image.png)

This creates a red rectangle. PixiJS supports multiple color formats for the
`fill()` method. Developers can choose a format based on their needs. For
example, CSS color strings are user-friendly and readable, hexadecimal strings
are compact and widely used in design tools, and numbers are efficient for
programmatic use. Arrays and Color objects offer precise control, making them
ideal for advanced graphics.

- CSS color strings (e.g., 'red', 'blue')
- Hexadecimal strings (e.g., '#ff0000')
- Numbers (e.g., `0xff0000`)
- Arrays (e.g., `[255, 0, 0]`)
- Color objects for precise color control

### Examples:

```ts
// Using a number
const obj1 = new Graphics().rect(0, 0, 100, 100).fill(0xff0000);

// Using a hex string
const obj2 = new Graphics().rect(0, 0, 100, 100).fill("#ff0000");

// Using an array
const obj3 = new Graphics().rect(0, 0, 100, 100).fill([255, 0, 0]);

// Using a Color object
const color = new Color();
const obj4 = new Graphics().rect(0, 0, 100, 100).fill(color);
```

## Fill with a Style Object

For more advanced fills, you can use a `FillStyle` object. This allows for
additional customization, such as setting opacity:

```ts
const obj = new Graphics().rect(0, 0, 100, 100).fill({
  color: "red",
  alpha: 0.5, // 50% opacity
});
```

![alt text](/assets/guides/components/image-1.png)

## Fill with Textures

Filling shapes with textures is just as simple:

```ts
const texture = await Assets.load("assets/image.png");
const obj = new Graphics().rect(0, 0, 100, 100).fill(texture);
```

![alt text](/assets/guides/components/image-2.png)

### Local vs. Global Texture Space

Textures can be applied in two coordinate spaces:

- **Local Space** (Default): The texture coordinates are mapped relative to the
  shape's dimensions and position. The texture coordinates use a normalized
  coordinate system where (0,0) is the top-left and (1,1) is the bottom-right of
  the shape, regardless of its actual pixel dimensions. For example, if you have
  a 300x200 pixel texture filling a 100x100 shape, the texture will be scaled to
  fit exactly within those 100x100 pixels. The texture's top-left corner (0,0)
  will align with the shape's top-left corner, and the texture's bottom-right
  corner (1,1) will align with the shape's bottom-right corner, stretching or
  compressing the texture as needed.

```ts
const shapes = new PIXI.Graphics()
  .rect(50, 50, 100, 100)
  .circle(250, 100, 50)
  .star(400, 100, 6, 60, 40)
  .roundRect(500, 50, 100, 100, 10)
  .fill({
    texture,
    textureSpace: "local", // default!
  });
```

![alt text](/assets/guides/components/image-13.png)

- **Global Space**: Set `textureSpace: 'global'` to make the texture position
  and scale relative to the Graphics object's coordinate system. Despite the
  name, this isn't truly "global" - the texture remains fixed relative to the
  Graphics object itself, maintaining its position even when the object moves or
  scales. See how the image goes across all the shapes (in the same graphics)
  below:

```ts
const shapes = new PIXI.Graphics()
  .rect(50, 50, 100, 100)
  .circle(250, 100, 50)
  .star(400, 100, 6, 60, 40)
  .roundRect(500, 50, 100, 100, 10)
  .fill({
    texture,
    textureSpace: "global",
  });
```

![alt text](/assets/guides/components/image-11.png)

### Using Matrices with Textures

To modify texture coordinates, you can apply a transformation matrix, which is a
mathematical tool used to scale, rotate, or translate the texture. If you're
unfamiliar with transformation matrices, they allow for precise control over how
textures are rendered, and you can explore more about them
[here](https://learnwebgl.brown37.net/10_surface_properties/texture_mapping_transforms.html#:~:text=Overview%C2%B6,by%2D4%20transformation%20matrix).

```ts
const matrix = new Matrix().scale(0.5, 0.5);

const obj = new Graphics().rect(0, 0, 100, 100).fill({
  texture: texture,
  matrix: matrix, // scale the texture down by 2
});
```

![alt text](/assets/guides/components/image-4.png)

### Texture Gotcha's

1. **Sprite Sheets**: If using a texture from a sprite sheet, the entire source
   texture will be used. To use a specific frame, create a new texture:

```ts
const spriteSheetTexture = Texture.from("assets/my-sprite-sheet.png");
const newTexture = renderer.generateTexture(Sprite.from(spriteSheetTexture));

const obj = new Graphics().rect(0, 0, 100, 100).fill(newTexture);
```

2. **Power of Two Textures**: Textures should be power-of-two dimensions for
   proper tiling in WebGL1 (WebGL2 and WebGPU are fine).

## Fill with Gradients

PixiJS supports both linear and radial gradients, which can be created using the
`FillGradient` class. Gradients are particularly useful for adding visual depth
and dynamic styling to shapes and text.

### Linear Gradients

Linear gradients create a smooth color transition along a straight line. Here is
an example of a simple linear gradient:

```ts
const gradient = new FillGradient({
  type: "linear",
  colorStops: [
    { offset: 0, color: "yellow" },
    { offset: 1, color: "green" },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-5.png)

You can control the gradient direction with the following properties:

- `start {x, y}`: These define the starting point of the gradient. For example,
  in a linear gradient, this is where the first color stop is positioned. These
  values are typically expressed in relative coordinates (0 to 1), where `0`
  represents the left/top edge and `1` represents the right/bottom edge of the
  shape.

- `end {x, y}`: These define the ending point of the gradient. Similar to
  `start {x, y}`, these values specify where the last color stop is positioned
  in the shape's local coordinate system.

Using these properties, you can create various gradient effects, such as
horizontal, vertical, or diagonal transitions. For example, setting `start` to
`{x: 0, y: 0}` and `end` to `{x: 1, y: 1}` would result in a diagonal gradient
from the top-left to the bottom-right of the shape.

```ts
const diagonalGradient = new FillGradient({
  type: "linear",
  start: { x: 0, y: 0 },
  end: { x: 1, y: 1 },
  colorStops: [
    { offset: 0, color: "yellow" },
    { offset: 1, color: "green" },
  ],
});
```

![alt text](/assets/guides/components/image-6.png)

### Radial Gradients

Radial gradients create a smooth color transition in a circular pattern. Unlike
linear gradients, they blend colors from one circle to another. Here is an
example of a simple radial gradient:

```ts
const gradient = new FillGradient({
  type: "radial",
  colorStops: [
    { offset: 0, color: "yellow" },
    { offset: 1, color: "green" },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-7.png)

You can control the gradient's shape and size using the following properties:

- `center {x, y}`: These define the center of the inner circle where the
  gradient starts. Typically, these values are expressed in relative coordinates
  (0 to 1), where `0.5` represents the center of the shape.

- `innerRadius`: The radius of the inner circle. This determines the size of the
  gradient's starting point.

- `outerCenter {x, y}`: These define the center of the outer circle where the
  gradient ends. Like `center {x, y}`, these values are also relative
  coordinates.

- `outerRadius`: The radius of the outer circle. This determines the size of the
  gradient's ending point.

By adjusting these properties, you can create a variety of effects, such as
small, concentrated gradients or large, expansive ones. For example, setting a
small `r0` and a larger `r1` will create a gradient that starts does not start
to transition until the inner circle radius is reached.

```ts
const radialGradient = new FillGradient({
  type: "radial",
  center: { x: 0.5, y: 0.5 },
  innerRadius: 0.25,
  outerCenter: { x: 0.5, y: 0.5 },
  outerRadius: 0.5,
  colorStops: [
    { offset: 0, color: "blue" },
    { offset: 1, color: "red" },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill(gradient);
```

![alt text](/assets/guides/components/image-8.png)

### Gradient Gotcha's

1. **Memory Management**: Use `fillGradient.destroy()` to free up resources when
   gradients are no longer needed.

2. **Animation**: Update existing gradients instead of creating new ones for
   better performance.

3. **Custom Shaders**: For complex animations, custom shaders may be more
   efficient.

4. **Texture and Matrix Limitations**: Under the hood, gradient fills set both
   the texture and matrix properties internally. This means you cannot use a
   texture fill or matrix transformation at the same time as a gradient fill.

### Combining Textures and Colors

You can combine a texture or gradients with a color tint and alpha to achieve
more complex and visually appealing effects. This allows you to overlay a color
on top of the texture or gradient, adjusting its transparency with the alpha
value.

```ts
const gradient = new FillGradient({
  colorStops: [
    { offset: 0, color: "blue" },
    { offset: 1, color: "red" },
  ],
});

const obj = new Graphics().rect(0, 0, 100, 100).fill({
  fill: gradient,
  color: "yellow",
  alpha: 0.5,
});
```

![alt text](/assets/guides/components/image-10.png)

```ts
const obj = new Graphics().rect(0, 0, 100, 100).fill({
  texture: texture,
  color: "yellow",
  alpha: 0.5,
});
```

![alt text](/assets/guides/components/image-9.png)

---

Hopefully, this guide has shown you how easy and powerful fills can be when
working with graphics (and text!). By mastering the `fill()` method, you can
unlock endless possibilities for creating visually dynamic and engaging graphics
in PixiJS. Have fun!

---

## Graphics Pixel Line

import { Sandpack } from '@codesandbox/sandpack-react'; import { dracula } from
'@codesandbox/sandpack-themes';

# Graphics Pixel Line

The `pixelLine` property is a neat feature of the PixiJS Graphics API that
allows you to create lines that remain 1 pixel thick, regardless of scaling or
zoom level. As part of the Graphics API, it gives developers all the power
PixiJS provides for building and stroking shapes. This feature is especially
useful for achieving crisp, pixel-perfect visuals, particularly in retro-style
or grid-based games, technical drawing, or UI rendering.

In this guide, we'll dive into how this property works, its use cases, and the
caveats you should be aware of when using it.

---

```ts
import { Application, Container, Graphics, Text } from "pixi.js";

/**
 * Creates a grid pattern using Graphics lines
 * @param graphics - The Graphics object to draw on
 * @returns The Graphics object with the grid drawn
 */
function buildGrid(graphics) {
  // Draw 10 vertical lines spaced 10 pixels apart
  for (let i = 0; i < 11; i++) {
    // Move to top of each line (x = i*10, y = 0)
    graphics
      .moveTo(i * 10, 0)
      // Draw down to bottom (x = i*10, y = 100)
      .lineTo(i * 10, 100);
  }

  // Draw 10 horizontal lines spaced 10 pixels apart
  for (let i = 0; i < 11; i++) {
    // Move to start of each line (x = 0, y = i*10)
    graphics
      .moveTo(0, i * 10)
      // Draw across to end (x = 100, y = i*10)
      .lineTo(100, i * 10);
  }

  return graphics;
}

(async () => {
  // Create and initialize a new PixiJS application
  const app = new Application();

  await app.init({ antialias: true, resizeTo: window });
  document.body.appendChild(app.canvas);

  // Create two grids - one with pixel-perfect lines and one without
  const gridPixel = buildGrid(new Graphics()).stroke({
    color: 0xffffff,
    pixelLine: true,
    width: 1,
  });

  const grid = buildGrid(new Graphics()).stroke({
    color: 0xffffff,
    pixelLine: false,
  });

  // Position the grids side by side
  grid.x = -100;
  grid.y = -50;
  gridPixel.y = -50;

  // Create a container to hold both grids
  const container = new Container();

  container.addChild(grid, gridPixel);

  // Center the container on screen
  container.x = app.screen.width / 2;
  container.y = app.screen.height / 2;
  app.stage.addChild(container);

  // Animation variables
  let count = 0;

  // Add animation to scale the grids over time
  app.ticker.add(() => {
    count += 0.01;
    container.scale = 1 + (Math.sin(count) + 1) * 2;
  });

  // Add descriptive label
  const label = new Text({
    text:
      "Grid Comparison: Standard Lines (Left) vs Pixel-Perfect Lines (Right)",
    style: { fill: 0xffffff },
  });

  // Position label in top-left corner
  label.position.set(20, 20);
  label.width = app.screen.width - 40;
  label.scale.y = label.scale.x;
  app.stage.addChild(label);
})();
```

## How to use `pixelLine`?

Here’s a simple example:

```ts
// Create a Graphics object and draw a pixel-perfect line
let graphics = new Graphics()
  .moveTo(0, 0)
  .lineTo(100, 100)
  .stroke({ color: 0xff0000, pixelLine: true });

// Add it to the stage
app.stage.addChild(graphics);

// Even if we scale the Graphics object, the line remains 1 pixel wide
graphics.scale.set(2);
```

In this example, no matter how you transform or zoom the `Graphics` object, the
red line will always appear 1 pixel thick on the screen.

---

## Why Use `pixelLine`?

Pixel-perfect lines can be incredibly useful in a variety of scenarios. Here are
some common use cases:

### 1. **Retro or Pixel Art Games**

- Pixel art games rely heavily on maintaining sharp, precise visuals. The
  `pixelLine` property ensures that lines do not blur or scale inconsistently
  with other pixel elements.
- Example: Drawing pixel-perfect grids for tile-based maps.

```ts
// Create a grid of vertical and horizontal lines
const grid = new Graphics();

// Draw 10 vertical lines spaced 10 pixels apart
// Draw vertical lines
for (let i = 0; i < 10; i++) {
  // Move to top of each line (x = i*10, y = 0)
  grid
    .moveTo(i * 10, 0)
    // Draw down to bottom (x = i*10, y = 100)
    .lineTo(i * 10, 100);
}

// Draw horizontal lines
for (let i = 0; i < 10; i++) {
  // Move to start of each line (x = 0, y = i*10)
  grid
    .moveTo(0, i * 10)
    // Draw across to end (x = 100, y = i*10)
    .lineTo(100, i * 10);
}

// Stroke all lines in white with pixel-perfect width
grid.stroke({ color: 0xffffff, pixelLine: true });
```

---

### 2. **UI and HUD Elements**

- For UI elements such as borders, separators, or underlines, a consistent
  1-pixel thickness provides a professional, clean look.
- Example: Drawing a separator line in a menu or a progress bar border.

```ts
// Create a separator line that will always be 1 pixel thick
const separator = new Graphics()
  // Start at x=0, y=50
  .moveTo(0, 50)
  // Draw a horizontal line 200 pixels to the right
  .lineTo(200, 50)
  // Stroke in green with pixel-perfect 1px width
  .stroke({ color: 0x00ff00, pixelLine: true });
```

---

### 3. **Debugging and Prototyping**

- Use pixel-perfect lines to debug layouts, collision boxes, or grids. Since the
  lines don’t scale, they offer a consistent reference point during development.
- Example: Displaying collision boundaries in a physics-based game.

```ts
// Create a debug box with pixel-perfect stroke
const graphicsBox = new Graphics()
  .rect(0, 0, 100, 100)
  .stroke({ color: 0xff00ff, pixelLine: true });

/**
 * Updates the debug box to match the bounds of a given object
 * @param {Container} obj - The object to draw bounds for
 */
function drawDebugBounds(obj) {
  // Get the bounds of the object
  let bounds = obj.getBounds().rectangle;

  // Position and scale the debug box to match the bounds
  // this is faster than using `moveTo` and `lineTo` each frame!
  graphicsBox.position.set(bounds.x, bounds.y);
  graphicsBox.scale.set(bounds.width / 100, bounds.height / 100);
}
```

---

## How it works

This is achieved under the hood using WebGL or WebGPU's native line rendering
methods when `pixelLine` is set to `true`.

Fun fact its actually faster to draw a pixel line than a regular line. This is
because of two main factors:

1. **Simpler Drawing Process**: Regular lines in PixiJS (when `pixelLine` is
   `false`) need extra steps to be drawn. PixiJS has to figure out the thickness
   of the line and create a shape that looks like a line but is actually made up
   of triangles.

2. **Direct Line Drawing**: When using `pixelLine`, we can tell the graphics
   card "just draw a line from point A to point B" and it knows exactly what to
   do. This is much simpler and faster than creating and filling shapes.

Think of it like drawing a line on paper - `pixelLine` is like using a pen to
draw a straight line, while regular lines are like having to carefully color in
a thin rectangle. The pen method is naturally faster and simpler!

## Caveats and Gotchas

While the `pixelLine` property is incredibly useful, there are some limitations
and things to keep in mind:

### 1. **Its 1px thick, thats it!**

- The line is always 1px thick, there is no way to change this as its using the
  GPU to draw the line.

### 2. **Hardware may render differently**

- Different GPUs and graphics hardware may render the line slightly differently
  due to variations in how they handle line rasterization. For example, some
  GPUs may position the line slightly differently or apply different
  anti-aliasing techniques. This is an inherent limitation of GPU line rendering
  and is beyond PixiJS's control.

### 4. **Scaling Behavior**

- While the line thickness remains constant, other properties (e.g., position or
  start/end points) are still affected by scaling. This can sometimes create
  unexpected results if combined with other scaled objects. This is a feature
  not a bug :)

### Example: Box with Pixel-Perfect Stroke

Here's an example of a filled box with a pixel-perfect stroke. The box itself
scales and grows, but the stroke remains 1 pixel wide:

```ts
// Create a Graphics object and draw a filled box with a pixel-perfect stroke
let box = new Graphics()
  .rect(0, 0, 100, 100)
  .fill("white")
  .stroke({ color: 0xff0000, pixelLine: true });

// Add it to the stage
app.stage.addChild(box);

// Scale the box
box.scale.set(2);
```

In this example, the blue box grows as it scales, but the red stroke remains at
1 pixel thickness, providing a crisp outline regardless of the scaling.

---

## When to Avoid Using `pixelLine`

- **You want a line that is not 1px thick:** Don't use `pixelLine`.
- **You want the line to scale:** Don't use `pixelLine`

---

## Conclusion

The `pixelLine` property is a super useful to have in the PixiJS toolbox for
developers looking to create sharp, pixel-perfect lines that remain consistent
under transformation. By understanding its strengths and limitations, you can
incorporate it into your projects for clean, professional results in both visual
and functional elements.

---

## Graphics

# Graphics

[Graphics](https://pixijs.download/release/docs/scene.Graphics.html) is a
powerful and flexible tool for rendering shapes such as rectangles, circles,
stars, and custom polygons. It can also be used to create complex shapes by
combining multiple primitives, and it supports advanced features like gradients,
textures, and masks.

```ts
import { Graphics } from "pixi.js";

const graphics = new Graphics().rect(50, 50, 100, 100).fill(0xff0000);
```

## **Available Shapes**

PixiJS v8 supports a variety of shape primitives:

### Basic Primitives

- Line
- Rectangle
- Rounded Rectangle
- Circle
- Ellipse
- Arc
- Bezier / Quadratic Curves

### Advanced Primitives

- Chamfer Rect
- Fillet Rect
- Regular Polygon
- Star
- Rounded Polygon
- Rounded Shape

```ts
const graphics = new Graphics()
  .rect(50, 50, 100, 100)
  .fill(0xff0000)
  .circle(200, 200, 50)
  .stroke(0x00ff00)
  .lineStyle(5)
  .moveTo(300, 300)
  .lineTo(400, 400);
```

### SVG Support

You can also load SVG path data, although complex hole geometries may render
inaccurately due to Pixi's performance-optimized triangulation system.

```ts
let shape = new Graphics().svg(`
  
    
  
`);
```

## **GraphicsContext**

The `GraphicsContext` class is the core of PixiJS's new graphics model. It holds
all the drawing commands and styles, allowing the same shape data to be reused
by multiple `Graphics` instances:

```ts
const context = new GraphicsContext().circle(100, 100, 50).fill("red");

const shapeA = new Graphics(context);
const shapeB = new Graphics(context); // Shares the same geometry
```

This pattern is particularly effective when rendering repeated or animated
shapes, such as frame-based SVG swaps:

```ts
let frames = [
  new GraphicsContext().circle(100, 100, 50).fill("red"),
  new GraphicsContext().rect(0, 0, 100, 100).fill("red"),
];

let graphic = new Graphics(frames[0]);

function update() {
  graphic.context = frames[1]; // Very cheap operation
}
```

:::info If you don't explicitly pass a `GraphicsContext` when creating a
`Graphics` object, then internally, it will have its own context, accessible via
`myGraphics.context`. :::

### Destroying a GraphicsContext

When you destroy a `GraphicsContext`, all `Graphics` instances that share it
will also be destroyed. This is a crucial point to remember, as it can lead to
unexpected behavior if you're not careful.

```ts
const context = new GraphicsContext().circle(100, 100, 50).fill("red");
const shapeA = new Graphics(context);
const shapeB = new Graphics(context); // Shares the same geometry

shapeA.destroy({ context: true }); // Destroys both shapeA and shapeB
```

## **Creating Holes**

Use `.cut()` to remove a shape from the previous one:

```ts
const g = new Graphics()
  .rect(0, 0, 100, 100)
  .fill(0x00ff00)
  .circle(50, 50, 20)
  .cut(); // Creates a hole in the green rectangle
```

Ensure the hole is fully enclosed within the shape to avoid triangulation
errors.

## **Graphics Is About Building, Not Drawing**

Despite the terminology of functions like `.rect()` or `.circle()`, `Graphics`
does not immediately draw anything. Instead, each method builds up a list of
geometry primitives stored inside a `GraphicsContext`. These are then rendered
when the object is drawn to the screen or used in another context, such as a
mask.

```ts
const graphic = new Graphics().rect(0, 0, 200, 100).fill(0xff0000);

app.stage.addChild(graphic); // The rendering happens here
```

You can think of `Graphics` as a blueprint builder: it defines what to draw, but
not when to draw it. This is why `Graphics` objects can be reused, cloned,
masked, and transformed without incurring extra computation until they're
actually rendered.

## **Performance Best Practices**

- **Do not clear and rebuild graphics every frame**. If your content is dynamic,
  prefer swapping prebuilt `GraphicsContext` objects instead of recreating them.
- **Use `Graphics.destroy()`** to clean up when done. Shared contexts are not
  auto-destroyed.
- **Use many simple `Graphics` objects** over one complex one to maintain GPU
  batching.
- **Avoid transparent overlap** unless you understand blend modes; overlapping
  semi-transparent primitives will interact per primitive, not post-composition.

## **Caveats and Gotchas**

- **Memory Leaks**: Call `.destroy()` when no longer needed.
- **SVG and Holes**: Not all SVG hole paths triangulate correctly.
- **Changing Geometry**: Use `.clear()` sparingly. Prefer swapping contexts.
- **Transparency and Blend Modes**: These apply per primitive. Use
  `RenderTexture` if you want to flatten effects.

---

## **API Reference**

- [Graphics](https://pixijs.download/release/docs/scene.Graphics.html)
- [GraphicsContext](https://pixijs.download/release/docs/scene.GraphicsContext.html)
- [FillStyle](https://pixijs.download/release/docs/scene.FillStyle.html)
- [StrokeStyle](https://pixijs.download/release/docs/scene.StrokeStyle.html)

---

## Scene Objects
