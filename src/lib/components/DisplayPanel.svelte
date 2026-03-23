<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";

  let {
    onImageChange,
    onStyleChange,
  }: {
    onImageChange?: (brightness: number, contrast: number, saturation: number) => void;
    onStyleChange?: (style: { fillAlpha: number; strokeWidth: number; strokeAlpha: number }) => void;
  } = $props();

  // Image adjustments (1.0 = default for all)
  let brightness = $state(100);
  let contrast = $state(100);
  let saturation = $state(100);

  // Annotation style
  let fillAlpha = $state(8);
  let strokeWidth = $state(15); // stored as 10x for slider precision (1.5 → 15)
  let strokeAlpha = $state(80);

  function emitImage() {
    onImageChange?.(brightness / 100, contrast / 100, saturation / 100);
  }

  function emitStyle() {
    onStyleChange?.({
      fillAlpha: fillAlpha / 100,
      strokeWidth: strokeWidth / 10,
      strokeAlpha: strokeAlpha / 100,
    });
  }

  function resetAll() {
    brightness = 100;
    contrast = 100;
    saturation = 100;
    fillAlpha = 8;
    strokeWidth = 15;
    strokeAlpha = 80;
    emitImage();
    emitStyle();
  }
</script>

<details class="border-b">
  <summary class="flex cursor-pointer items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
    Display
    <Button
      variant="ghost"
      size="sm"
      class="h-5 w-5 p-0"
      title="Reset display settings"
      onclick={(e: MouseEvent) => { e.preventDefault(); resetAll(); }}
    >
      <RotateCcw class="h-3 w-3" />
    </Button>
  </summary>

  <div class="space-y-3 px-3 pb-3 pt-1">
    <!-- Image section -->
    <div class="space-y-1.5">
      <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Image</span>

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Brightness</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{brightness}%</span>
      </label>
      <input type="range" min="0" max="200" bind:value={brightness} oninput={emitImage}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Contrast</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{contrast}%</span>
      </label>
      <input type="range" min="0" max="200" bind:value={contrast} oninput={emitImage}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Saturation</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{saturation}%</span>
      </label>
      <input type="range" min="0" max="200" bind:value={saturation} oninput={emitImage}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />
    </div>

    <!-- Annotations section -->
    <div class="space-y-1.5">
      <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Annotations</span>

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Fill opacity</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{fillAlpha}%</span>
      </label>
      <input type="range" min="0" max="100" bind:value={fillAlpha} oninput={emitStyle}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Stroke width</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{(strokeWidth / 10).toFixed(1)}</span>
      </label>
      <input type="range" min="1" max="80" bind:value={strokeWidth} oninput={emitStyle}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />

      <label class="flex items-center justify-between text-xs">
        <span class="text-muted-foreground">Stroke opacity</span>
        <span class="w-8 text-right tabular-nums text-muted-foreground">{strokeAlpha}%</span>
      </label>
      <input type="range" min="0" max="100" bind:value={strokeAlpha} oninput={emitStyle}
        class="h-1 w-full cursor-pointer appearance-none rounded-full bg-muted accent-foreground" />
    </div>
  </div>
</details>
