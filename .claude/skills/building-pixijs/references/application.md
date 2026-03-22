# Application

The `Application` class provides a modern, extensible entry point to set up
rendering in PixiJS. It abstracts common tasks like renderer setup and ticker
updates, and is designed to support both WebGL and WebGPU via async
initialization.

## Creating an Application

Creating an application requires two steps: constructing an instance, then
initializing it asynchronously using `.init()`:

```ts
import { Application } from "pixi.js";

const app = new Application();

await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
});

document.body.appendChild(app.canvas);
```

### ApplicationOptions Reference

The `.init()` method of `Application` accepts a `Partial` object with the
following configuration options:

| Option                   | Type                                | Default     | Description                                                                                                                              |
| ------------------------ | ----------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `autoStart`              | `boolean`                           | `true`      | Whether to start rendering immediately after initialization. Setting to `false` will not stop the shared ticker if it's already running. |
| `resizeTo`               | `Window \| HTMLElement`             | —           | Element to auto-resize the renderer to match.                                                                                            |
| `sharedTicker`           | `boolean`                           | `false`     | Use the shared ticker instance if `true`; otherwise, a private ticker is created.                                                        |
| `preference`             | `'webgl' \| 'webgpu'`               | `webgl`     | Preferred renderer type.                                                                                                                 |
| `useBackBuffer`          | `boolean`                           | `false`     | _(WebGL only)_ Use the back buffer when required.                                                                                        |
| `forceFallbackAdapter`   | `boolean`                           | `false`     | _(WebGPU only)_ Force usage of fallback adapter.                                                                                         |
| `powerPreference`        | `'high-performance' \| 'low-power'` | `undefined` | Hint for GPU power preference (WebGL & WebGPU).                                                                                          |
| `antialias`              | `boolean`                           | —           | Enables anti-aliasing. May impact performance.                                                                                           |
| `autoDensity`            | `boolean`                           | —           | Adjusts canvas size based on `resolution`. Applies only to `HTMLCanvasElement`.                                                          |
| `background`             | `ColorSource`                       | —           | Alias for `backgroundColor`.                                                                                                             |
| `backgroundAlpha`        | `number`                            | `1`         | Alpha transparency for background (0 = transparent, 1 = opaque).                                                                         |
| `backgroundColor`        | `ColorSource`                       | `'black'`   | Color used to clear the canvas. Accepts hex, CSS color, or array.                                                                        |
| `canvas`                 | `ICanvas`                           | —           | A custom canvas instance (optional).                                                                                                     |
| `clearBeforeRender`      | `boolean`                           | `true`      | Whether the renderer should clear the canvas each frame.                                                                                 |
| `context`                | `WebGL2RenderingContext \| null`    | `null`      | User-supplied rendering context (WebGL).                                                                                                 |
| `depth`                  | `boolean`                           | —           | Enable a depth buffer in the main view. Always `true` for WebGL.                                                                         |
| `height`                 | `number`                            | `600`       | Initial height of the renderer (in pixels).                                                                                              |
| `width`                  | `number`                            | `800`       | Initial width of the renderer (in pixels).                                                                                               |
| `hello`                  | `boolean`                           | `false`     | Log renderer info and version to the console.                                                                                            |
| `multiView`              | `boolean`                           | `false`     | Enable multi-canvas rendering.                                                                                                           |
| `preferWebGLVersion`     | `1 \| 2`                            | `2`         | Preferred WebGL version.                                                                                                                 |
| `premultipliedAlpha`     | `boolean`                           | `true`      | Assume alpha is premultiplied in color buffers.                                                                                          |
| `preserveDrawingBuffer`  | `boolean`                           | `false`     | Preserve buffer between frames. Needed for `toDataURL`.                                                                                  |
| `resolution`             | `number`                            | 1           | The resolution of the renderer.                                                                                                          |
| `skipExtensionImports`   | `boolean`                           | `false`     | Prevent automatic import of default PixiJS extensions.                                                                                   |
| `textureGCActive`        | `boolean`                           | `true`      | Enable garbage collection for GPU textures.                                                                                              |
| `textureGCCheckCountMax` | `number`                            | `600`       | Frame interval between GC runs (textures).                                                                                               |
| `textureGCMaxIdle`       | `number`                            | `3600`      | Max idle frames before destroying a texture.                                                                                             |
| `textureGCAMaxIdle`      | `number`                            | —           | (Appears undocumented; placeholder for internal GC controls.)                                                                            |

### Customizing Application Options Per Renderer Type

You can also override properties based on the renderer type by using the
`WebGLOptions` or `WebGPUOptions` interfaces. For example:

```ts
import { Application } from "pixi.js";

const app = new Application();
await app.init({
  width: 800,
  height: 600,
  backgroundColor: 0x1099bb,
  webgl: {
    antialias: true,
  },
  webgpu: {
    antialias: false,
  },
});
document.body.appendChild(app.canvas);
```

---

## Built-In Plugins

PixiJS includes:

- ✅ **Ticker Plugin** — Updates every frame → [Guide](./ticker-plugin.md)
- ✅ **Resize Plugin** — Resizes renderer/canvas → [Guide](./resize-plugin.md)
- ➕ **Optional: Culler Plugin** - Culls objects that are out of frame →
  [Guide](./culler-plugin.md)

---

## Creating a Custom Application Plugin

You can create custom plugins for the `Application` class. A plugin must
implement the `ApplicationPlugin` interface, which includes `init()` and
`destroy()` methods. You can also specify the `extension` type, which is
`ExtensionType.Application` for application plugins.

Both functions are called with `this` set as the `Application` instance e.g
`this.renderer` or `this.stage` is available.

The `init()` method is called when the application is initialized and passes the
options from the `application.init` call, and the `destroy()` method is called
when the application is destroyed.

```ts
import type { ApplicationOptions, ApplicationPlugin, ExtensionType } from 'pixi.js';

const myPlugin: ApplicationPlugin = {
    extension: ExtensionType.Application;
    init(options: ApplicationOptions) {
        console.log('Custom plugin init:', this, options);
    },
    destroy() {
        console.log('Custom plugin destroy');
    },
};
```

Register with:

```ts
import { extensions } from "pixi.js";
extensions.add(myPlugin);
```

### Adding Types

If you are using TypeScript, or are providing a plugin for others to use, you
can extend the `ApplicationOptions` interface to include your custom plugins
options.

```ts
declare global {
  namespace PixiMixins {
    interface ApplicationOptions {
      myPlugin?: import("./myPlugin").PluginOptions | null;
    }
  }
}

await app.init({
  myPlugin: {
    customOption: true, // Now TypeScript will know about this option
  },
});
```

---

## API Reference

- [Overview](https://pixijs.download/release/docs/app.html)
- [Application](https://pixijs.download/release/docs/app.Application.html)
- [ApplicationOptions](https://pixijs.download/release/docs/app.ApplicationOptions.html)
  - [AutoDetectOptions](https://pixijs.download/release/docs/rendering.AutoDetectOptions.html)
  - [WebGLOptions](https://pixijs.download/release/docs/rendering.WebGLOptions.html)
  - [WebGPUOptions](https://pixijs.download/release/docs/rendering.WebGPUOptions.html)
  - [SharedRendererOptions](https://pixijs.download/release/docs/rendering.SharedRendererOptions.html)
- [TickerPlugin](https://pixijs.download/release/docs/app.TickerPlugin.html)
- [ResizePlugin](https://pixijs.download/release/docs/app.ResizePlugin.html)
- [CullerPlugin](https://pixijs.download/release/docs/app.CullerPlugin.html)

---

## Resize Plugin

# Resize Plugin

The `ResizePlugin` provides automatic resizing functionality for PixiJS
applications. When enabled, it listens to window or element resize events and
resizes the application's renderer accordingly.

This is useful for:

- Making the canvas responsive to the browser window
- Maintaining aspect ratio or fitting to containers
- Handling layout changes without manual resize calls

By default, PixiJS adds this plugin when initializing an `Application`, but you
can also register it manually if you're using a custom setup.

---

## Usage

```ts
import { Application } from "pixi.js";

const app = new Application();

await app.init({
  width: 800,
  height: 600,
  resizeTo: window,
});
```

### Default Behavior

- When using `Application.init()` with no overrides, the `ResizePlugin` is
  installed automatically:
- When `resizeTo` is set, the renderer automatically adjusts to match the
  dimensions of the target (`window` or `HTMLElement`).
- Resizing is throttled using `requestAnimationFrame` to prevent performance
  issues during rapid resize events.
- You can trigger a resize manually with `app.resize()` or cancel a scheduled
  resize with `app.cancelResize()`.

### Manual Registration

If you're managing extensions manually:

```ts
import { extensions, ResizePlugin } from "pixi.js";

extensions.add(ResizePlugin);
```

### Custom Resize Target

You can specify a custom target for resizing. This is useful if you want to
resize the canvas to fit a specific element rather than the entire window.

```ts
await app.init({
  resizeTo: document.getElementById("game-container"),
});
```

---

## API Reference

- [`ResizePlugin`](https://pixijs.download/release/docs/app.ResizePlugin.html)

---

## Ticker Plugin

# Ticker Plugin

The `TickerPlugin` provides a built-in update loop for your PixiJS
`Application`. This loop calls `.render()` at a regular cadence—by default, once
per animation frame—and integrates with PixiJS's `Ticker` system for precise
control over frame-based updates.

PixiJS includes this plugin automatically when you initialize an `Application`,
but you can also opt out and add it manually.

## Usage

```ts
const app = new Application();

await app.init({
  sharedTicker: false,
  autoStart: true,
});

app.ticker.add((ticker) => {
  // Custom update logic here
  bunny.rotation += 1 * ticker.deltaTime;
});
```

### Default Behavior

The `TickerPlugin` is included automatically unless disabled:

```ts
const app = new Application();

await app.init({
  autoStart: true, // Automatically starts the render loop
  sharedTicker: false, // Use a dedicated ticker
});
```

### Manual Registration

If you're managing extensions yourself:

```ts
import { extensions, TickerPlugin } from "pixi.js";

extensions.add(TickerPlugin);
```

# Shared vs Custom Ticker

The plugin supports two modes:

| Option                | Description                                                  |
| --------------------- | ------------------------------------------------------------ |
| `sharedTicker: true`  | Uses `Ticker.shared`, shared across all applications.        |
| `sharedTicker: false` | Creates a private ticker instance scoped to the application. |

### Behavior Differences

- If using a **shared ticker**, other code may also be registering updates, so
  the order of execution can vary.
- If using a **custom ticker**, you get complete control over timing and update
  order.

---

## Lifecycle Control

You can manually stop and start the ticker:

```ts
app.stop(); // Stop automatic rendering
app.start(); // Resume
```

This is useful for:

- Pausing the game or animation
- Performance throttling on inactive tabs
- Managing visibility events

---

## API Reference

- [TickerPlugin](https://pixijs.download/release/docs/app.TickerPlugin.html)
- [Ticker](https://pixijs.download/release/docs/ticker.Ticker.html)

---

## Background Loader
