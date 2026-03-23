<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
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
  import Eye from "@lucide/svelte/icons/eye";
  import Pencil from "@lucide/svelte/icons/pencil";

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
  } = $props();
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

  <!-- Bottom spacer + status -->
  <div class="mt-auto flex flex-col items-center gap-1">
    {#if isDirty}
      <div class="h-2 w-2 rounded-full bg-amber-500" title="Unsaved changes"></div>
    {/if}
    {#if annotationCount > 0}
      <span class="text-[9px] text-muted-foreground">{annotationCount}</span>
    {/if}
  </div>
</div>
