<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import X from "@lucide/svelte/icons/x";

  interface ColumnInfo {
    name: string;
    numeric: boolean;
  }

  let {
    open = false,
    columns = [] as ColumnInfo[],
    onClose,
    onImageChange,
    onStyleChange,
    onHeatmapChange,
  }: {
    open?: boolean;
    columns?: ColumnInfo[];
    onClose?: () => void;
    onImageChange?: (brightness: number, contrast: number, saturation: number) => void;
    onStyleChange?: (style: { fillAlpha: number; strokeWidth: number; strokeAlpha: number }) => void;
    onHeatmapChange?: (column: string | null) => void;
  } = $props();

  let activeTab = $state<"heatmap" | "image">("heatmap");

  // Image adjustments
  let brightness = $state(100);
  let contrast = $state(100);
  let saturation = $state(100);

  // Annotation style
  let fillAlpha = $state(8);
  let strokeWidth = $state(15);
  let strokeAlpha = $state(80);

  // Heatmap
  let heatmapColumn = $state<string>("none");

  // Exclude geometry/id/metadata columns
  const EXCLUDED = new Set(["id", "page_id", "x", "y", "width", "height", "polygon", "metadata"]);
  const heatmapColumns = $derived(columns.filter((c) => !EXCLUDED.has(c.name)));
  const numericColumns = $derived(heatmapColumns.filter((c) => c.numeric));
  const categoricalColumns = $derived(heatmapColumns.filter((c) => !c.numeric));

  const selectedColInfo = $derived(heatmapColumns.find((c) => c.name === heatmapColumn));

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
    heatmapColumn = "none";
    emitImage();
    emitStyle();
    onHeatmapChange?.(null);
  }
</script>

{#if open}
  <div class="flex h-full w-56 flex-col border-r bg-background">
    <!-- Header -->
    <div class="flex items-center justify-between border-b px-3 py-2">
      <span class="text-xs font-medium">Display</span>
      <div class="flex items-center gap-1">
        <Button variant="ghost" size="sm" class="h-6 w-6 p-0" title="Reset all" onclick={resetAll}>
          <RotateCcw class="h-3 w-3" />
        </Button>
        <Button variant="ghost" size="sm" class="h-6 w-6 p-0" title="Close" onclick={() => onClose?.()}>
          <X class="h-3 w-3" />
        </Button>
      </div>
    </div>

    <!-- Tab switcher -->
    <div class="flex border-b">
      <button
        class="flex-1 py-1.5 text-center text-xs font-medium transition-colors"
        class:text-foreground={activeTab === "heatmap"}
        class:border-b-2={activeTab === "heatmap"}
        class:border-primary={activeTab === "heatmap"}
        class:text-muted-foreground={activeTab !== "heatmap"}
        onclick={() => (activeTab = "heatmap")}
      >
        Heatmap
      </button>
      <button
        class="flex-1 py-1.5 text-center text-xs font-medium transition-colors"
        class:text-foreground={activeTab === "image"}
        class:border-b-2={activeTab === "image"}
        class:border-primary={activeTab === "image"}
        class:text-muted-foreground={activeTab !== "image"}
        onclick={() => (activeTab = "image")}
      >
        Image
      </button>
    </div>

    <div class="flex-1 overflow-y-auto p-3">
      {#if activeTab === "heatmap"}
        <!-- Heatmap tab -->
        <div class="space-y-3">
          <!-- Color by column -->
          <div class="space-y-1.5">
            <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Color by</span>
            <Select
              type="single"
              value={heatmapColumn}
              onValueChange={(v) => {
                if (v !== undefined) {
                  heatmapColumn = v;
                  onHeatmapChange?.(v === "none" ? null : v);
                }
              }}
            >
              <SelectTrigger size="sm" class="w-full text-xs">
                {heatmapColumn === "none" ? "Default (status)" : heatmapColumn}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Default (status)</SelectItem>
                {#if numericColumns.length > 0}
                  <div class="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">Numeric</div>
                  {#each numericColumns as col (col.name)}
                    <SelectItem value={col.name}>{col.name}</SelectItem>
                  {/each}
                {/if}
                {#if categoricalColumns.length > 0}
                  <div class="px-2 py-1 text-[10px] font-medium uppercase text-muted-foreground">Categorical</div>
                  {#each categoricalColumns as col (col.name)}
                    <SelectItem value={col.name}>{col.name}</SelectItem>
                  {/each}
                {/if}
              </SelectContent>
            </Select>
          </div>

          <!-- Legend / info -->
          {#if heatmapColumn !== "none" && selectedColInfo}
            <div class="space-y-1">
              {#if selectedColInfo.numeric}
                <div class="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <div class="h-2 flex-1 rounded-sm" style="background: linear-gradient(to right, #ef4444, #eab308, #22c55e)"></div>
                </div>
                <p class="text-[10px] text-muted-foreground">low &rarr; high</p>
              {:else}
                <p class="text-[10px] text-muted-foreground">Distinct color per category</p>
              {/if}
            </div>
          {/if}

          <!-- Annotation rendering -->
          <div class="space-y-1.5 pt-2">
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

      {:else}
        <!-- Image tab -->
        <div class="space-y-1.5">
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
      {/if}
    </div>
  </div>
{/if}
