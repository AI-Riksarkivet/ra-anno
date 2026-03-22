<script lang="ts">
  import PixiCanvas from "$lib/pixi/PixiCanvas.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { annotationStore } from "$lib/stores/annotations.svelte.js";
  import type { PixiContext } from "$lib/pixi/types.js";

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let imageLoaded = $state(false);

  const table = $derived(annotationStore.table("mock-page-001"));
  let pixiCtx = $state<PixiContext | null>(null);

  $effect(() => {
    if (table && pixiCtx) {
      pixiCtx.plugins.arrow.load(table);
      pixiCtx.plugins.arrow.sync();
    }
  });

  async function handleReady(ctx: PixiContext) {
    pixiCtx = ctx;
    await ctx.plugins.image.load("/api/images/mock-page-001");
    imageLoaded = true;
    await annotationStore.load("mock-page-001");
  }
</script>

<div class="flex h-[calc(100vh-3rem)] flex-col">
  <div class="flex items-center gap-2 border-b px-4 py-2">
    <h1 class="text-sm font-medium">PixiJS Canvas Test</h1>
    <Badge variant="outline">zoom: {zoom.toFixed(2)}</Badge>
    <Badge variant="outline">pan: {panX.toFixed(0)}, {panY.toFixed(0)}</Badge>
    {#if table}
      <Badge variant="default">{table.numRows} annotations</Badge>
    {/if}
  </div>

  <div class="relative flex-1">
    <PixiCanvas
      bind:zoom
      bind:panX
      bind:panY
      onready={(ctx) => {
        handleReady(ctx);
      }}
    />

    {#if !imageLoaded}
      <div
        class="absolute inset-0 flex items-center justify-center bg-muted/50"
      >
        <p class="text-sm text-muted-foreground">Loading...</p>
      </div>
    {/if}
  </div>
</div>
