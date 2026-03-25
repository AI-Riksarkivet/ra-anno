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
  let samInputs = $state({ points: 0, bboxes: 0, polygons: 0 });
  let samPointMode = $state(false);
  let samBboxMode = $state(false);
</script>

<!-- Vertical left sidebar toolbar -->
<div class="flex h-full w-11 flex-col items-center border-r bg-background py-2">
  <!-- Mode toggle -->
  <Button
    variant={mode === "edit" ? "default" : "outline"}
    size="sm"
    class="mb-2 h-8 w-8 p-0"
    title={mode === "view" ? "Switch to Edit" : "Switch to View"}
    onclick={() => onToggleMode?.()}
  >
    {#if mode === "view"}
      <Eye class="h-4 w-4" />
    {:else}
      <Pencil class="h-4 w-4" />
    {/if}
  </Button>

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
        <Popover.Content side="right" align="start" sideOffset={8} class="w-72" onInteractOutside={(e) => e.preventDefault()}>
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

            <!-- Geometry inputs -->
            <div>
              <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Geometry inputs</span>
              <p class="mb-2 text-[9px] text-muted-foreground">Click buttons below, then interact with the canvas to add inputs.</p>

              <div class="flex flex-col gap-1">
                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs {samPointMode ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
                  onclick={() => { samPointMode = !samPointMode; samBboxMode = false; }}
                >
                  <Crosshair class="h-3.5 w-3.5" />
                  <span class="flex-1 text-left">Add points</span>
                  {#if samInputs.points > 0}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">{samInputs.points}</Badge>
                  {/if}
                  {#if samPointMode}
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                  {/if}
                </button>

                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs {samBboxMode ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent'}"
                  onclick={() => { samBboxMode = !samBboxMode; samPointMode = false; }}
                >
                  <RectangleHorizontal class="h-3.5 w-3.5" />
                  <span class="flex-1 text-left">Add bounding box</span>
                  {#if samInputs.bboxes > 0}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">{samInputs.bboxes}</Badge>
                  {/if}
                  {#if samBboxMode}
                    <span class="h-1.5 w-1.5 animate-pulse rounded-full bg-primary"></span>
                  {/if}
                </button>

                <button
                  class="flex items-center gap-2 rounded-md border px-2 py-1.5 text-xs border-border hover:bg-accent"
                  onclick={() => { samInputs = { ...samInputs, polygons: samInputs.polygons + 1 }; }}
                >
                  <Spline class="h-3.5 w-3.5" />
                  <span class="flex-1 text-left">Use existing polygons</span>
                  {#if samInputs.polygons > 0}
                    <Badge variant="secondary" class="h-4 px-1 text-[10px]">{samInputs.polygons}</Badge>
                  {/if}
                </button>
              </div>
            </div>

            <Separator />

            <!-- Actions -->
            <div class="flex gap-1.5">
              <Button variant="default" size="sm" class="flex-1 gap-1 text-xs" disabled={!samPrompt && samInputs.points === 0 && samInputs.bboxes === 0 && samInputs.polygons === 0}>
                <Play class="h-3 w-3" />
                Run Inference
              </Button>
              <Button variant="outline" size="sm" class="text-xs" onclick={() => { samInputs = { points: 0, bboxes: 0, polygons: 0 }; samPrompt = ""; samPointMode = false; samBboxMode = false; }}>
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
