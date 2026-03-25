<script lang="ts">
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import type { Tool } from "$lib/pixi/types.js";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import Hand from "@lucide/svelte/icons/hand";
  import Square from "@lucide/svelte/icons/square";
  import Pentagon from "@lucide/svelte/icons/pentagon";
  import Scissors from "@lucide/svelte/icons/scissors";
  import Magnet from "@lucide/svelte/icons/magnet";
  import LassoIcon from "@lucide/svelte/icons/lasso";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Redo2 from "@lucide/svelte/icons/redo-2";
  import SaveIcon from "@lucide/svelte/icons/save";
  import SlidersHorizontal from "@lucide/svelte/icons/sliders-horizontal";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import Columns2 from "@lucide/svelte/icons/columns-2";
  import AnimatedShinyText from "$lib/components/magic/animated-shiny-text/animated-shiny-text.svelte";
  import Eye from "@lucide/svelte/icons/eye";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Bot from "@lucide/svelte/icons/bot";
  import Crosshair from "@lucide/svelte/icons/crosshair";
  import RectangleHorizontal from "@lucide/svelte/icons/rectangle-horizontal";
  import Spline from "@lucide/svelte/icons/spline";
  import MessageSquare from "@lucide/svelte/icons/message-square";
  import Play from "@lucide/svelte/icons/play";

  let {
    activeTool = "select",
    canUndo = false,
    canRedo = false,
    isDirty = false,
    annotationCount = 0,
    mode = "edit",
    onToolChange,
    onToggleMode,
    onUndo,
    onRedo,
    onSave,
    displayOpen = false,
    onToggleDisplay,
    galleryOpen = false,
    onToggleGallery,
    splitOpen = false,
    onToggleSplit,
  }: {
    activeTool?: Tool;
    canUndo?: boolean;
    canRedo?: boolean;
    isDirty?: boolean;
    annotationCount?: number;
    mode?: "view" | "edit";
    onToolChange?: (tool: Tool) => void;
    onToggleMode?: () => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSave?: () => void;
    displayOpen?: boolean;
    onToggleDisplay?: () => void;
    galleryOpen?: boolean;
    onToggleGallery?: () => void;
    splitOpen?: boolean;
    onToggleSplit?: () => void;
  } = $props();

  // SAM popover state
  let samOpen = $state(false);
  let samModel = $state("SAM3 + GroundingDINO");
  let samPrompt = $state("");
  let samInputMode = $state<"none" | "point" | "bbox" | "polygon">("none");
  // Dummy collected inputs
  let samPoints = $state<{ x: number; y: number }[]>([]);
  let samBbox = $state<{ x: number; y: number; w: number; h: number } | null>(null);
  let samPolygonCount = $state(0);

  function selectInputMode(mode: "point" | "bbox" | "polygon") {
    samInputMode = samInputMode === mode ? "none" : mode;
    // Dummy: simulate getting data from canvas after a short delay
    if (samInputMode === "point") {
      setTimeout(() => {
        samPoints = [...samPoints, { x: Math.round(Math.random() * 800), y: Math.round(Math.random() * 1100) }];
      }, 500);
    } else if (samInputMode === "bbox") {
      setTimeout(() => {
        samBbox = { x: Math.round(Math.random() * 400), y: Math.round(Math.random() * 600), w: 200 + Math.round(Math.random() * 200), h: 100 + Math.round(Math.random() * 200) };
        samInputMode = "none";
      }, 500);
    } else if (samInputMode === "polygon") {
      setTimeout(() => {
        samPolygonCount++;
        samInputMode = "none";
      }, 500);
    }
  }

  function clearSamInputs() {
    samPoints = [];
    samBbox = null;
    samPolygonCount = 0;
    samPrompt = "";
    samInputMode = "none";
  }

  const hasSamInput = $derived(samPrompt.length > 0 || samPoints.length > 0 || samBbox !== null || samPolygonCount > 0);
</script>

<!-- Vertical left sidebar toolbar -->
<div class="flex h-full w-11 flex-col items-center border-r bg-background py-2">
  <!-- Mode toggle -->
  <button
    class="mb-2 flex flex-col items-center gap-0.5"
    title={mode === "view" ? "Switch to Edit mode" : "Switch to View mode"}
    onclick={() => onToggleMode?.()}
  >
    <div class="flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 transition-all duration-300 {mode === 'edit' ? 'bg-primary text-primary-foreground shadow-[0_0_12px_3px] shadow-primary/50' : 'bg-primary/10 text-primary/50'}">
      {#if mode === "edit"}
        <Pencil class="h-4 w-4" />
      {:else}
        <Eye class="h-4 w-4" />
      {/if}
    </div>
    <span class="text-[8px] font-medium uppercase {mode === 'edit' ? 'text-primary' : 'text-primary/40'}">{mode === "edit" ? "Edit" : "View"}</span>
  </button>

  <Separator class="mb-2 w-6" />

  <!-- Group: Navigation tools (select, pan, lasso) -->
  <div class="flex flex-col gap-0.5">
    <Button
      variant={activeTool === "select" ? "default" : "ghost"}
      size="sm"
      class="h-8 w-8 p-0"
      title="Select (1)"
      onclick={() => onToolChange?.("select")}
    >
      <MousePointer2 class="h-4 w-4" />
    </Button>
    <Button
      variant={activeTool === "pan" ? "default" : "ghost"}
      size="sm"
      class="h-8 w-8 p-0"
      title="Pan (0)"
      onclick={() => onToolChange?.("pan")}
    >
      <Hand class="h-4 w-4" />
    </Button>
    <Button
      variant={activeTool === "lasso" ? "default" : "ghost"}
      size="sm"
      class="h-8 w-8 p-0"
      title="Lasso Select (6)"
      onclick={() => onToolChange?.("lasso")}
    >
      <LassoIcon class="h-4 w-4" />
    </Button>
  </div>

  {#if mode === "edit"}
    <Separator class="my-2 w-6" />

    <!-- Group: Drawing tools (rect, polygon, scissors, magnetic) -->
    <div class="flex flex-col gap-0.5">
      <Button
        variant={activeTool === "rect" ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Rectangle (2)"
        onclick={() => onToolChange?.("rect")}
      >
        <Square class="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "polygon" ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Polygon (3)"
        onclick={() => onToolChange?.("polygon")}
      >
        <Pentagon class="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "scissors" ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Intelligent Scissors (4)"
        onclick={() => onToolChange?.("scissors")}
      >
        <Scissors class="h-4 w-4" />
      </Button>
      <Button
        variant={activeTool === "magnetic" ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Magnetic Cursor (5)"
        onclick={() => onToolChange?.("magnetic")}
      >
        <Magnet class="h-4 w-4" />
      </Button>
    </div>

    <Separator class="my-2 w-6" />

    <!-- Group: Edit actions (undo, redo, save) -->
    <div class="flex flex-col gap-0.5">
      <Button
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        onclick={() => onUndo?.()}
      >
        <Undo2 class="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        onclick={() => onRedo?.()}
      >
        <Redo2 class="h-4 w-4" />
      </Button>
      <Button
        variant={isDirty ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Save (Ctrl+S)"
        disabled={!isDirty}
        onclick={() => onSave?.()}
      >
        <SaveIcon class="h-4 w-4" />
      </Button>
    </div>

    <Separator class="my-2 w-6" />

    <!-- AI tools -->
    <div class="flex flex-col gap-0.5">
      <!-- SAM / GroundingDINO popover -->
      <Popover.Root bind:open={samOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <Button
              {...props}
              variant={samOpen ? "default" : "ghost"}
              size="sm"
              class="h-8 w-8 p-0"
              title="AI-assisted labeling"
            >
              <Sparkles class="h-4 w-4" />
            </Button>
          {/snippet}
        </Popover.Trigger>
        <Popover.Content side="right" align="start" sideOffset={8} avoidCollisions={false} class="w-72" onInteractOutside={(e) => e.preventDefault()}>
          <div class="space-y-3">
            <div>
              <h4 class="text-sm font-medium">AI-Assisted Labeling</h4>
              <p class="text-[10px] text-muted-foreground">Provide inputs for the model, then run inference.</p>
            </div>

            <Separator />

            <!-- Model selector -->
            <div>
              <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Model</span>
              <select class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none" bind:value={samModel}>
                <option>SAM3 + GroundingDINO</option>
                <option>SAM2 + GroundingDINO</option>
                <option>SAM3 (points only)</option>
                <option>GroundingDINO (text only)</option>
              </select>
            </div>

            <!-- Text prompt -->
            <div>
              <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Text prompt</span>
              <Input class="h-7 text-xs" placeholder="e.g. handwritten text, signature, stamp..." bind:value={samPrompt} />
              <p class="mt-0.5 text-[9px] text-muted-foreground">Used by GroundingDINO for open-vocabulary detection</p>
            </div>

            <Separator />

            <!-- Input selection mode (pick one) -->
            <div>
              <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Input selection</span>
              <p class="mb-2 text-[9px] text-muted-foreground">Choose one input mode, then interact with the canvas.</p>

              <div class="flex flex-col gap-1">
                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs {samInputMode === 'point' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
                  onclick={() => selectInputMode("point")}
                >
                  <Crosshair class="h-3.5 w-3.5" />
                  <div class="flex-1 text-left">
                    <div>Point</div>
                    <div class="text-[9px] text-muted-foreground">Click canvas to place coordinates</div>
                  </div>
                  {#if samPoints.length > 0}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">{samPoints.length}</Badge>
                  {/if}
                  {#if samInputMode === "point"}
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                  {/if}
                </button>

                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs {samInputMode === 'bbox' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
                  onclick={() => selectInputMode("bbox")}
                >
                  <RectangleHorizontal class="h-3.5 w-3.5" />
                  <div class="flex-1 text-left">
                    <div>Bounding box</div>
                    <div class="text-[9px] text-muted-foreground">Drag on canvas to select region crop</div>
                  </div>
                  {#if samBbox}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">1</Badge>
                  {/if}
                  {#if samInputMode === "bbox"}
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                  {/if}
                </button>

                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs {samInputMode === 'polygon' ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
                  onclick={() => selectInputMode("polygon")}
                >
                  <Spline class="h-3.5 w-3.5" />
                  <div class="flex-1 text-left">
                    <div>Polygon</div>
                    <div class="text-[9px] text-muted-foreground">Select annotation polygon as region crop</div>
                  </div>
                  {#if samPolygonCount > 0}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">{samPolygonCount}</Badge>
                  {/if}
                  {#if samInputMode === "polygon"}
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                  {/if}
                </button>
              </div>
            </div>

            <!-- Collected input preview -->
            {#if samPoints.length > 0 || samBbox || samPolygonCount > 0}
              <div class="rounded-md border border-border bg-muted/30 p-2">
                <span class="mb-1 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Collected input</span>
                {#if samPoints.length > 0}
                  <div class="text-[10px] text-muted-foreground">
                    {#each samPoints as pt, i (i)}
                      <span class="mr-1 inline-block rounded bg-muted px-1 py-0.5 font-mono text-[9px]">({pt.x}, {pt.y})</span>
                    {/each}
                  </div>
                {/if}
                {#if samBbox}
                  <div class="text-[10px] text-muted-foreground">
                    <span class="inline-block rounded bg-muted px-1 py-0.5 font-mono text-[9px]">bbox({samBbox.x}, {samBbox.y}, {samBbox.w}×{samBbox.h})</span>
                    <span class="ml-1 text-[9px]">→ crop</span>
                  </div>
                {/if}
                {#if samPolygonCount > 0}
                  <div class="text-[10px] text-muted-foreground">
                    <span class="inline-block rounded bg-muted px-1 py-0.5 font-mono text-[9px]">{samPolygonCount} polygon{samPolygonCount > 1 ? "s" : ""}</span>
                    <span class="ml-1 text-[9px]">→ crop</span>
                  </div>
                {/if}
              </div>
            {/if}

            <Separator />

            <!-- Actions -->
            <div class="flex gap-1.5">
              <Button variant="default" size="sm" class="flex-1 gap-1 text-xs" disabled={!hasSamInput}>
                <Play class="h-3 w-3" />
                Run Inference
              </Button>
              <Button variant="outline" size="sm" class="text-xs" onclick={clearSamInputs}>
                Clear
              </Button>
            </div>
          </div>
        </Popover.Content>
      </Popover.Root>

      <Button
        variant="ghost"
        size="sm"
        class="h-8 w-8 p-0"
        title="AI quality judge — coming soon"
        disabled
      >
        <Bot class="h-4 w-4" />
      </Button>
    </div>
  {/if}

  {#if mode === "view"}
    <Separator class="my-2 w-6" />

    <!-- Group: View tools — view mode only -->
    <div class="flex flex-col gap-0.5">
      <Button
        variant={displayOpen ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Display & heatmap"
        onclick={() => onToggleDisplay?.()}
      >
        <SlidersHorizontal class="h-4 w-4" />
      </Button>
      <Button
        variant={galleryOpen ? "default" : "ghost"}
        size="sm"
        class="h-8 w-8 p-0"
        title="Page gallery"
        onclick={() => onToggleGallery?.()}
      >
        <LayoutGrid class="h-4 w-4" />
      </Button>
    </div>
  {/if}

  <!-- Split view toggle (always visible) -->
  <Button
    variant={splitOpen ? "default" : "ghost"}
    size="sm"
    class="h-8 w-8 p-0"
    title="Split view — compare annotations"
    onclick={() => onToggleSplit?.()}
  >
    <Columns2 class="h-4 w-4" />
  </Button>

  <!-- Bottom spacer + status -->
  <div class="mt-auto flex flex-col items-center gap-1">
    {#if isDirty}
      <div class="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes"></div>
    {/if}
  </div>
</div>
