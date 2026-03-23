<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import Minus from "@lucide/svelte/icons/minus";
  import Plus from "@lucide/svelte/icons/plus";
  import Maximize from "@lucide/svelte/icons/maximize";

  let {
    zoom = 1,
    onZoomIn,
    onZoomOut,
    onResetView,
  }: {
    zoom?: number;
    onZoomIn?: () => void;
    onZoomOut?: () => void;
    onResetView?: () => void;
  } = $props();

  const pct = $derived(Math.round(zoom * 100));
</script>

<div class="flex items-center gap-0.5 rounded-md border bg-background/90 shadow-sm backdrop-blur-sm">
  <Button
    variant="ghost"
    size="sm"
    class="h-7 w-7 p-0"
    title="Zoom out"
    onclick={() => onZoomOut?.()}
  >
    <Minus class="h-3.5 w-3.5" />
  </Button>
  <span class="w-10 text-center text-xs tabular-nums text-muted-foreground">{pct}%</span>
  <Button
    variant="ghost"
    size="sm"
    class="h-7 w-7 p-0"
    title="Zoom in"
    onclick={() => onZoomIn?.()}
  >
    <Plus class="h-3.5 w-3.5" />
  </Button>
  <Button
    variant="ghost"
    size="sm"
    class="h-7 w-7 p-0"
    title="Fit to view"
    onclick={() => onResetView?.()}
  >
    <Maximize class="h-3.5 w-3.5" />
  </Button>
</div>
