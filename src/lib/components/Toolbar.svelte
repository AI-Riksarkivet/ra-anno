<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import type { Tool } from "$lib/pixi/types.js";
  import MousePointer2 from "@lucide/svelte/icons/mouse-pointer-2";
  import Square from "@lucide/svelte/icons/square";
  import Pentagon from "@lucide/svelte/icons/pentagon";
  import Scissors from "@lucide/svelte/icons/scissors";
  import Magnet from "@lucide/svelte/icons/magnet";
  import Undo2 from "@lucide/svelte/icons/undo-2";
  import Redo2 from "@lucide/svelte/icons/redo-2";
  import SaveIcon from "@lucide/svelte/icons/save";

  let {
    activeTool = "select",
    canUndo = false,
    canRedo = false,
    isDirty = false,
    annotationCount = 0,
    mode = "edit",
    onToolChange,
    onUndo,
    onRedo,
    onSave,
  }: {
    activeTool?: Tool;
    canUndo?: boolean;
    canRedo?: boolean;
    isDirty?: boolean;
    annotationCount?: number;
    mode?: "view" | "edit";
    onToolChange?: (tool: Tool) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onSave?: () => void;
  } = $props();
</script>

<div class="flex items-center gap-1 border-b px-3 py-1.5">
  <div class="flex items-center gap-1">
    <Button
      variant={activeTool === "select" ? "default" : "ghost"}
      size="sm"
      onclick={() => onToolChange?.("select")}
    >
      <MousePointer2 class="mr-1 h-4 w-4" />
      Select
    </Button>
    {#if mode === "edit"}
      <Button
        variant={activeTool === "rect" ? "default" : "ghost"}
        size="sm"
        onclick={() => onToolChange?.("rect")}
      >
        <Square class="mr-1 h-4 w-4" />
        Rect
      </Button>
      <Button
        variant={activeTool === "polygon" ? "default" : "ghost"}
        size="sm"
        onclick={() => onToolChange?.("polygon")}
      >
        <Pentagon class="mr-1 h-4 w-4" />
        Polygon
      </Button>
      <Button
        variant={activeTool === "scissors" ? "default" : "ghost"}
        size="sm"
        onclick={() => onToolChange?.("scissors")}
      >
        <Scissors class="mr-1 h-4 w-4" />
        Scissors
      </Button>
      <Button
        variant={activeTool === "magnetic" ? "default" : "ghost"}
        size="sm"
        onclick={() => onToolChange?.("magnetic")}
      >
        <Magnet class="mr-1 h-4 w-4" />
        Magnetic
      </Button>
    {/if}
  </div>

  <Separator orientation="vertical" class="mx-1 h-6" />

  <div class="flex items-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      disabled={!canUndo}
      onclick={() => onUndo?.()}
    >
      <Undo2 class="mr-1 h-4 w-4" />
      Undo
    </Button>
    <Button
      variant="ghost"
      size="sm"
      disabled={!canRedo}
      onclick={() => onRedo?.()}
    >
      <Redo2 class="mr-1 h-4 w-4" />
      Redo
    </Button>
  </div>

  <Separator orientation="vertical" class="mx-1 h-6" />

  <Button
    variant={isDirty ? "default" : "ghost"}
    size="sm"
    disabled={!isDirty}
    onclick={() => onSave?.()}
  >
    <SaveIcon class="mr-1 h-4 w-4" />
    Save
  </Button>

  <div class="ml-auto flex items-center gap-2">
    {#if isDirty}
      <Badge variant="outline" class="text-amber-600">unsaved</Badge>
    {/if}
    {#if annotationCount > 0}
      <Badge variant="secondary">{annotationCount} annotations</Badge>
    {/if}
  </div>
</div>
