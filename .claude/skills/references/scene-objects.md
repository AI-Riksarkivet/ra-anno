# Scene Objects

In PixiJS, scene objects are the building blocks of your application’s display
hierarchy. They include **containers**, **sprites**, **text**, **graphics**, and
other drawable entities that make up the **scene graph**—the tree-like structure
that determines what gets rendered, how, and in what order.

## Containers vs. Leaf Nodes

Scene objects in PixiJS can be divided into **containers** and **leaf nodes**:

### Containers

`Container` is the **base class** for all scene objects in v8 (replacing the old
`DisplayObject`).

- Can have children.
- Commonly used to group objects and apply transformations (position, scale,
  rotation) to the group.
- Examples: `Application.stage`, user-defined groups.

```ts
const group = new Container();
group.addChild(spriteA);
group.addChild(spriteB);
```

### Leaf Nodes

Leaf nodes are renderable objects that should not have children. In v8, **only
containers should have children**.

Examples of leaf nodes include:

- `Sprite`
- `Text`
- `Graphics`
- `Mesh`
- `TilingSprite`
- `HTMLText`

Attempting to add children to a leaf node will not result in a runtime error,
however, you may run into unexpected rendering behavior. Therefore, If nesting
is required, wrap leaf nodes in a `Container`.

**Before v8 (invalid in v8):**

```ts
const sprite = new Sprite();
sprite.addChild(anotherSprite); // ❌ Invalid in v8
```

**v8 approach:**

```ts
const group = new Container();
group.addChild(sprite);
group.addChild(anotherSprite); // ✅ Valid
```

## Transforms

All scene objects in PixiJS have several properties that control their position,
rotation, scale, and alpha. These properties are inherited by child objects,
allowing you to apply transformations to groups of objects easily.

You will often use these properties to position and animate objects in your
scene.

| Property     | Description                                                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **position** | X- and Y-position are given in pixels and change the position of the object relative to its parent, also available directly as `object.x` / `object.y`  |
| **rotation** | Rotation is specified in radians, and turns an object clockwise (0.0 - 2 \* Math.PI)                                                                    |
| **angle**    | Angle is an alias for rotation that is specified in degrees instead of radians (0.0 - 360.0)                                                            |
| **pivot**    | Point the object rotates around, in pixels - also sets origin for child objects                                                                         |
| **alpha**    | Opacity from 0.0 (fully transparent) to 1.0 (fully opaque), inherited by children                                                                       |
| **scale**    | Scale is specified as a percent with 1.0 being 100% or actual-size, and can be set independently for the x and y axis                                   |
| **skew**     | Skew transforms the object in x and y similar to the CSS skew() function, and is specified in radians                                                   |
| **anchor?**  | Anchor is a percentage-based offset for the sprite's position and rotation. This is different from the `pivot` property, which is a pixel-based offset. |

### **Anchor vs Pivot**

Some leaf nodes have an additional property called `anchor`, which is a
percentage-based offset for the nodes position and rotation. This is different
from the `pivot` property, which is a pixel-based offset. Understanding the
difference between anchor and pivot is critical when positioning or rotating a
node.

:::info Setting either pivot or anchor visually moves the node. This differs
from CSS where changing `transform-origin` does not affect the element's
position. :::

#### **Anchor**

- Available only on `Sprite`
- Defined in normalized values `(0.0 to 1.0)`
- `(0, 0)` is the top-left, `(0.5, 0.5)` is the center
- Changes both position and rotation origin

```ts
sprite.anchor.set(0.5); // center
sprite.rotation = Math.PI / 4; // Rotate 45 degrees around the center
```

#### **Pivot**

- Available on all `Container`s
- Defined in **pixels**, not normalized

```ts
const sprite = new Sprite(texture);
sprite.width = 100;
sprite.height = 100;
sprite.pivot.set(50, 50); // Center of the container
container.rotation = Math.PI / 4; // Rotate 45 degrees around the pivot
```

## Measuring Bounds

There are two types of bounds in PixiJS:

- **Local bounds** represent the object’s dimensions in its own coordinate
  space. Use `getLocalBounds()`.
- **Global bounds** represent the object's bounding box in world coordinates.
  Use `getBounds()`.

```ts
const local = container.getLocalBounds();
const global = container.getBounds();
```

If performance is critical you can also provide a custom `boundsArea` to avoid
per-child measurement entirely.

### Changing size

To change the size of a container, you can use the `width` and `height`
properties. This will scale the container to fit the specified dimensions:

```ts
const container = new Container();
container.width = 100;
container.height = 200;
```

Setting the `width` and `height` individually can be an expensive operation, as
it requires recalculating the bounds of the container and its children. To avoid
this, you can use `setSize()` to set both properties at once:

```ts
const container = new Container();
container.setSize(100, 200);
const size = container.getSize(); // { width: 100, height: 200 }
```

This method is more efficient than setting `width` and `height` separately, as
it only requires one bounds calculation.

## Masking Scene Objects

PixiJS supports **masking**, allowing you to restrict the visible area of a
scene object based on another object's shape. This is useful for creating
effects like cropping, revealing, or hiding parts of your scene.

### Types of Masks

- **Graphics-based masks**: Use a `Graphics` object to define the shape.
- **Sprite-based masks**: Use a `Sprite` or other renderable object.

```ts
const shape = new Graphics().circle(100, 100, 50).fill(0x000000);

const maskedSprite = new Sprite(texture);
maskedSprite.mask = shape;

stage.addChild(shape);
stage.addChild(maskedSprite);
```

### Inverse Masks

To create an inverse mask, you can use the `setMask` property and set its
`inverse` option to `true`. This will render everything outside the mask.

```ts
const inverseMask = new Graphics().rect(0, 0, 200, 200).fill(0x000000);
const maskedContainer = new Container();
maskedContainer.setMask({ mask: inverseMask, inverse: true });
maskedContainer.addChild(sprite);
stage.addChild(inverseMask);
stage.addChild(maskedContainer);
```

### Notes on Masking

- The mask is **not rendered**; it's used only to define the visible area.
  However, it must be added to the display list.
- Only one mask can be assigned per object.
- For advanced blending, use **alpha masks** or **filters** (covered in later
  guides).

## Filters

Another common use for Container objects is as hosts for filtered content.
Filters are an advanced, WebGL/WebGPU-only feature that allows PixiJS to perform
per-pixel effects like blurring and displacements. By setting a filter on a
Container, the area of the screen the Container encompasses will be processed by
the filter after the Container's contents have been rendered.

```ts
const container = new Container();
const sprite = new Sprite(texture);
const filter = new BlurFilter({ strength: 8, quality: 4, kernelSize: 5 });
container.filters = [filter];
container.addChild(sprite);
```

:::info Filters should be used somewhat sparingly. They can slow performance and
increase memory usage if used too often in a scene. :::

Below are list of filters available by default in PixiJS. There is, however, a
community repository with
[many more filters](https://github.com/pixijs/filters).

| Filter             | Description                                                                                                   |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| AlphaFilter        | Similar to setting `alpha` property, but flattens the Container instead of applying to children individually. |
| BlurFilter         | Apply a blur effect                                                                                           |
| ColorMatrixFilter  | A color matrix is a flexible way to apply more complex tints or color transforms (e.g., sepia tone).          |
| DisplacementFilter | Displacement maps create visual offset pixels, for instance creating a wavy water effect.                     |
| NoiseFilter        | Create random noise (e.g., grain effect).                                                                     |

Under the hood, each Filter we offer out of the box is written in both glsl (for
WebGL) and wgsl (for WebGPU). This means all filters should work on both
renderers.

## Tinting

You can tint any scene object by setting the `tint` property. It modifies the
color of the rendered pixels, similar to multiplying a tint color over the
object.

```ts
const sprite = new Sprite(texture);
sprite.tint = 0xff0000; // Red tint
sprite.tint = "red"; // Red tint
```

The `tint` is inherited by child objects unless they specify their own. If only
part of your scene should be tinted, place it in a separate container.

A value of `0xFFFFFF` disables tinting.

```ts
const sprite = new Sprite(texture);
sprite.tint = 0x00ff00; // Green tint
sprite.tint = 0xffffff; // No tint
```

PixiJS supports a variety of color formats and you can find more information
from the [Color documentation](../color.md).

## Blend Modes

Blend modes determine how colors of overlapping objects are combined. PixiJS
supports a variety of blend modes, including:

- `normal`: Default blend mode.
- `add`: Adds the colors of the source and destination pixels.
- `multiply`: Multiplies the colors of the source and destination pixels.
- `screen`: Inverts the colors, multiplies them, and inverts again.

We also support may more advanced blend modes, such as `subtract`, `difference`,
and `overlay`. You can find the full list of blend modes in the
[Blend Modes documentation](../filters.md#advanced-blend-modes).

```ts
const sprite = new Sprite(texture);
sprite.blendMode = "multiply"; // Multiply blend mode
```

## Interaction

PixiJS provides a powerful interaction system that allows you to handle user
input events like clicks/hovers. To enable interaction on a scene object, can be
as simple as setting its `interactive` property to `true`.

```ts
const sprite = new Sprite(texture);
sprite.interactive = true;
sprite.on("click", (event) => {
  console.log("Sprite clicked!", event);
});
```

We have a detailed guide on [Interaction](../events.md) that covers how to set
up and manage interactions, including hit testing, pointer events, and more. We
highly recommend checking it out.

## Using `onRender`

The `onRender` callback allows you to run logic every frame when a scene object
is rendered. This is useful for lightweight animation and update logic:

```ts
const container = new Container();
container.onRender = () => {
  container.rotation += 0.01;
};
```

Note: In PixiJS v8, this replaces the common v7 pattern of overriding
`updateTransform`, which no longer runs every frame. The `onRender` function is
registered with the render group the container belongs to.

To remove the callback:

```ts
container.onRender = null;
```

---

## API Reference

- [Overview](https://pixijs.download/release/docs/scene.html)
- [Container](https://pixijs.download/release/docs/scene.Container.html)
- [ParticleContainer](https://pixijs.download/release/docs/scene.ParticleContainer.html)
- [Sprite](https://pixijs.download/release/docs/scene.Sprite.html)
- [TilingSprite](https://pixijs.download/release/docs/scene.TilingSprite.html)
- [NineSliceSprite](https://pixijs.download/release/docs/scene.NineSliceSprite.html)
- [Graphics](https://pixijs.download/release/docs/scene.Graphics.html)
- [Mesh](https://pixijs.download/release/docs/scene.Mesh.html)
- [Text](https://pixijs.download/release/docs/scene.Text.html)
- [Bitmap Text](https://pixijs.download/release/docs/scene.BitmapText.html)
- [HTMLText](https://pixijs.download/release/docs/scene.HTMLText.html)

---

## Mesh

# Mesh

PixiJS v8 offers a powerful `Mesh` system that provides full control over
geometry, UVs, indices, shaders, and WebGL/WebGPU state. Meshes are ideal for
custom rendering effects, advanced distortion, perspective manipulation, or
performance-tuned rendering pipelines.

```ts
import { Mesh, MeshGeometry, Shader, Texture } from "pixi.js";

const geometry = new MeshGeometry({
  positions: new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});

const shader = Shader.from({
  gl: {
    vertex: `
            attribute vec2 aPosition;
            attribute vec2 aUV;
            varying vec2 vUV;
            void main() {
                gl_Position = vec4(aPosition / 100.0 - 1.0, 0.0, 1.0);
                vUV = aUV;
            }
        `,
    fragment: `
            precision mediump float;
            varying vec2 vUV;
            uniform sampler2D uSampler;
            void main() {
                gl_FragColor = texture2D(uSampler, vUV);
            }
        `,
  },
  resources: {
    uSampler: Texture.from("image.png").source,
  },
});

const mesh = new Mesh({ geometry, shader });
app.stage.addChild(mesh);
```

## **What Is a Mesh?**

A mesh is a low-level rendering primitive composed of:

- **Geometry**: Vertex positions, UVs, indices, and other attributes
- **Shader**: A GPU program that defines how the geometry is rendered
- **State**: GPU state configuration (e.g. blending, depth, stencil)

With these elements, you can build anything from simple quads to curved surfaces
and procedural effects.

## **MeshGeometry**

All meshes in PixiJS are built using the `MeshGeometry` class. This class allows
you to define the vertex positions, UV coordinates, and indices that describe
the mesh's shape and texture mapping.

```ts
const geometry = new MeshGeometry({
  positions: Float32Array, // 2 floats per vertex
  uvs: Float32Array, // matching number of floats
  indices: Uint32Array, // 3 indices per triangle
  topology: "triangle-list",
});
```

You can access and modify buffers directly:

```ts
geometry.positions[0] = 50;
geometry.uvs[0] = 0.5;
geometry.indices[0] = 1;
```

## Built-in Mesh Types

### MeshSimple

A minimal wrapper over `Mesh` that accepts vertex, UV, and index arrays
directly. Suitable for fast static or dynamic meshes.

```ts
const mesh = new MeshSimple({
  texture: Texture.from("image.png"),
  vertices: new Float32Array([0, 0, 100, 0, 100, 100, 0, 100]),
  uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
  indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
});
```

- Use `autoUpdate = true` to update geometry per frame.
- Access `mesh.vertices` to read/write data.

### MeshRope

Bends a texture along a series of control points, often used for trails, snakes,
and animated ribbons.

```ts
const points = [new Point(0, 0), new Point(100, 0), new Point(200, 50)];
const rope = new MeshRope({
  texture: Texture.from("snake.png"),
  points,
  textureScale: 1, // optional
});
```

- `textureScale > 0` repeats texture; `0` stretches it.
- `autoUpdate = true` re-evaluates geometry each frame.

### MeshPlane

A flexible subdivided quad mesh, suitable for distortion or grid-based warping.

```ts
const plane = new MeshPlane({
  texture: Texture.from("image.png"),
  verticesX: 10,
  verticesY: 10,
});
```

- Automatically resizes on texture update when `autoResize = true`.

### PerspectiveMesh

A special subclass of `MeshPlane` that applies perspective correction by
transforming the UVs.

```ts
const mesh = new PerspectiveMesh({
  texture: Texture.from("image.png"),
  verticesX: 20,
  verticesY: 20,
  x0: 0,
  y0: 0,
  x1: 300,
  y1: 30,
  x2: 280,
  y2: 300,
  x3: 20,
  y3: 280,
});
```

- Set corner coordinates via `setCorners(...)`.
- Ideal for emulating 3D projection in 2D.

---

## **API Reference**

- [Mesh](https://pixijs.download/release/docs/scene.Mesh.html)
- [MeshGeometry](https://pixijs.download/release/docs/scene.MeshGeometry.html)
- [MeshSimple](https://pixijs.download/release/docs/scene.MeshSimple.html)
- [MeshRope](https://pixijs.download/release/docs/scene.MeshRope.html)
- [MeshPlane](https://pixijs.download/release/docs/scene.MeshPlane.html)
- [PerspectiveMesh](https://pixijs.download/release/docs/scene.PerspectiveMesh.html)
- [Shader](https://pixijs.download/release/docs/rendering.Shader.html)
- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)

---

## NineSlice Sprite

# NineSlice Sprite

`NineSliceSprite` is a specialized type of `Sprite` that allows textures to be
resized while preserving the corners and edges. It is particularly useful for
building scalable UI elements like buttons, panels, or windows with rounded or
decorated borders.

```ts
import { NineSliceSprite, Texture } from "pixi.js";

const nineSlice = new NineSliceSprite({
  texture: Texture.from("button.png"),
  leftWidth: 15,
  topHeight: 15,
  rightWidth: 15,
  bottomHeight: 15,
  width: 200,
  height: 80,
});

app.stage.addChild(nineSlice);
```

You can also pass just a texture, and the slice values will fall back to
defaults or be inferred from the texture’s `defaultBorders`.

## **How NineSlice Works**

Here’s how a nine-slice texture is divided:

```js
    A                          B
  +---+----------------------+---+
C | 1 |          2           | 3 |
  +---+----------------------+---+
  |   |                      |   |
  | 4 |          5           | 6 |
  |   |                      |   |
  +---+----------------------+---+
D | 7 |          8           | 9 |
  +---+----------------------+---+

Areas:
  - 1, 3, 7, 9: Corners (remain unscaled)
  - 2, 8: Top/Bottom center (stretched horizontally)
  - 4, 6: Left/Right center (stretched vertically)
  - 5: Center (stretched in both directions)
```

This ensures that decorative corners are preserved and the center content can
scale as needed.

## **Width and Height Behavior**

Setting `.width` and `.height` on a `NineSliceSprite` updates the **geometry
vertices**, not the texture UVs. This allows the texture to repeat or stretch
correctly based on the slice regions. This also means that the `width` and
`height` properties are not the same as the `scale` properties.

```ts
// The texture will stretch to fit the new dimensions
nineSlice.width = 300;
nineSlice.height = 100;

// The nine-slice will increase in size uniformly
nineSlice.scale.set(2); // Doubles the size
```

### **Original Width and Height**

If you need to know the original size of the nine-slice, you can access it
through the `originalWidth` and `originalHeight` properties. These values are
set when the `NineSliceSprite` is created and represent the dimensions of the
texture before any scaling or resizing is applied.

```ts
console.log(nineSlice.originalWidth);
console.log(nineSlice.originalHeight);
```

## **Dynamic Updates**

You can change slice dimensions or size at runtime:

```ts
nineSlice.leftWidth = 20;
nineSlice.topHeight = 25;
```

Each setter triggers a geometry update to reflect the changes.

---

## **API Reference**

- [NineSliceSprite](https://pixijs.download/release/docs/scene.NineSliceSprite.html)

---

## Particle Container

# Particle Container

PixiJS v8 introduces a high-performance particle system via the
`ParticleContainer` and `Particle` classes. Designed for rendering vast numbers
of lightweight visuals—like sparks, bubbles, bunnies, or explosions—this system
provides raw speed by stripping away all non-essential overhead.

:::warning **Experimental API Notice** The Particle API is stable but
**experimental**. Its interface may evolve in future PixiJS versions. We welcome
feedback to help guide its development. :::

```ts
import { Particle, ParticleContainer, Texture } from "pixi.js";

const texture = Texture.from("bunny.png");

const container = new ParticleContainer({
  dynamicProperties: {
    position: true, // default
    vertex: false,
    rotation: false,
    color: false,
  },
});

for (let i = 0; i < 100000; i++) {
  const particle = new Particle({
    texture,
    x: Math.random() * 800,
    y: Math.random() * 600,
  });

  container.addParticle(particle);
}

app.stage.addChild(container);
```

## **Why Use ParticleContainer?**

- **Extreme performance**: Render hundreds of thousands or even millions of
  particles with high FPS.
- **Lightweight design**: Particles are more efficient than `Sprite`, lacking
  extra features like children, events, or filters.
- **Fine-grained control**: Optimize rendering by declaring which properties are
  dynamic (updated every frame) or static (set once).

### **Performance Tip: Static vs. Dynamic**

- **Dynamic properties** are uploaded to the GPU every frame.
- **Static properties** are uploaded only when `update()` is called.

Declare your needs explicitly:

```ts
const container = new ParticleContainer({
  dynamicProperties: {
    position: true,
    rotation: true,
    vertex: false,
    color: false,
  },
});
```

If you later modify a static property or the particle list, you must call:

```ts
container.update();
```

## **Limitations and API Differences**

`ParticleContainer` is designed for speed and simplicity. As such, it doesn't
support the full `Container` API:

### ❌ Not Available:

- `addChild()`, `removeChild()`
- `getChildAt()`, `setChildIndex()`
- `swapChildren()`, `reparentChild()`

### ✅ Use Instead:

- `addParticle(particle)`
- `removeParticle(particle)`
- `removeParticles(beginIndex, endIndex)`
- `addParticleAt(particle, index)`
- `removeParticleAt(index)`

These methods operate on the `.particleChildren` array and maintain the internal
GPU buffers correctly.

## **Creating a Particle**

A `Particle` supports key display properties, and is far more efficient than
`Sprite`.

### **Particle Example**

```ts
const particle = new Particle({
  texture: Texture.from("spark.png"),
  x: 200,
  y: 100,
  scaleX: 0.8,
  scaleY: 0.8,
  rotation: Math.PI / 4,
  tint: 0xff0000,
  alpha: 0.5,
});
```

You can also use the shorthand:

```ts
const particle = new Particle(Texture.from("spark.png"));
```

---

## **API Reference**

- [ParticleContainer](https://pixijs.download/release/docs/scene.ParticleContainer.html)
- [Particle](https://pixijs.download/release/docs/scene.Particle.html)

---

## Sprite

# Sprite

Sprites are the foundational visual elements in PixiJS. They represent a single
image to be displayed on the screen. Each
[Sprite](https://pixijs.download/release/docs/scene.Sprite.html) contains a
[Texture](https://pixijs.download/release/docs/rendering.Texture.html) to be
drawn, along with all the transformation and display state required to function
in the scene graph.

```ts
import { Assets, Sprite } from "pixi.js";

const texture = await Assets.load("path/to/image.png");
const sprite = new Sprite(texture);

sprite.anchor.set(0.5);
sprite.position.set(100, 100);
sprite.scale.set(2);
sprite.rotation = Math.PI / 4; // Rotate 45 degrees
```

## Updating the Texture

If you change the texture of a sprite, it will automatically:

- Rebind listeners for texture updates
- Recalculate width/height if set so that the visual size remains the same
- Trigger a visual update

```ts
const texture = Assets.get("path/to/image.png");
sprite.texture = texture;
```

## **Scale vs Width/Height**

Sprites inherit `scale` from `Container`, allowing for percentage-based
resizing:

```ts
sprite.scale.set(2); // Double the size
```

Sprites also have `width` and `height` properties that act as _convenience
setters_ for `scale`, based on the texture’s dimensions:

```ts
sprite.width = 100; // Automatically updates scale.x
// sets: sprite.scale.x = 100 / sprite.texture.orig.width;
```

---

## API Reference

- [Sprite](https://pixijs.download/release/docs/scene.Sprite.html)
- [Texture](https://pixijs.download/release/docs/rendering.Texture.html)
- [Assets](https://pixijs.download/release/docs/assets.Assets.html)
