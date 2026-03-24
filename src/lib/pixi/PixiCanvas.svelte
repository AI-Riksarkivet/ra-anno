<script lang="ts">
  import { browser } from "$app/environment";
  import { onMount, setContext } from "svelte";
  import { Application } from "pixi.js";
  import { ArrowDataPlugin } from "./ArrowDataPlugin.js";
  import { ImagePlugin } from "./ImagePlugin.js";
  import { InteractionManager } from "./interaction/InteractionManager.js";
  import type { PixiContext } from "./types.js";
  import type { Snippet } from "svelte";

  let {
    children,
    zoom = $bindable(1),
    panX = $bindable(0),
    panY = $bindable(0),
    colorFn,
    annotationStyle,
    onready,
  }: {
    children?: Snippet;
    zoom?: number;
    panX?: number;
    panY?: number;
    colorFn?: (status: string) => number;
    annotationStyle?: { fillAlpha?: number; strokeWidth?: number; strokeAlpha?: number };
    onready?: (ctx: PixiContext) => void;
  } = $props();

  let containerEl: HTMLDivElement;
  let ready = $state(false);

  const pixiCtx: {
    app: Application | null;
    plugins: {
      image: ImagePlugin | null;
      arrow: ArrowDataPlugin | null;
      interaction: InteractionManager | null;
    };
  } = {
    app: null,
    plugins: { image: null, arrow: null, interaction: null },
  };
  setContext("pixi", pixiCtx);

  onMount(() => {
    if (!browser) return;

    const app = new Application();
    let imagePlugin: ImagePlugin;
    let arrowPlugin: ArrowDataPlugin;
    let interaction: InteractionManager;
    let resizeObs: ResizeObserver | null = null;
    let destroyed = false;

    (async () => {
      await app.init({
        resizeTo: containerEl,
        preference: "webgpu",
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      if (destroyed) return; // component unmounted during async init
      containerEl.appendChild(app.canvas);

      // Stop continuous rendering — render on demand only
      // This saves CPU/GPU when nothing is changing (document viewer, not a game)
      app.ticker.stop();

      // Since ticker is stopped, Pixi's ResizeObserver won't trigger a render.
      // Watch the container and re-render on size change.
      resizeObs = new ResizeObserver(() => {
        app.resize();
        app.render();
      });
      resizeObs.observe(containerEl);

      imagePlugin = new ImagePlugin(app);
      arrowPlugin = new ArrowDataPlugin(app, colorFn, annotationStyle);
      interaction = new InteractionManager(app, arrowPlugin);

      imagePlugin.canPan = () => interaction.currentTool === "pan";

      imagePlugin.onViewportChange = (bounds) => {
        zoom = imagePlugin.zoom;
        panX = imagePlugin.panX;
        panY = imagePlugin.panY;
        arrowPlugin.setViewport(bounds);
        interaction.updateHandles();
      };

      pixiCtx.app = app;
      pixiCtx.plugins.image = imagePlugin;
      pixiCtx.plugins.arrow = arrowPlugin;
      pixiCtx.plugins.interaction = interaction;
      ready = true;

      const rendererType = app.renderer.type === 0x02 ? "webgpu" : "webgl";
      console.log(`PixiJS renderer: ${rendererType}`);

      onready?.({
        app,
        plugins: { image: imagePlugin, arrow: arrowPlugin, interaction },
      });
    })();

    return () => {
      destroyed = true;
      resizeObs?.disconnect();
      interaction?.destroy();
      arrowPlugin?.destroy();
      imagePlugin?.destroy();
      app.destroy(true, { children: true });
    };
  });
</script>

<div
  bind:this={containerEl}
  class="relative h-full w-full overflow-hidden"
  style="cursor: default;"
>
  {#if ready && children}
    {@render children()}
  {/if}
</div>
