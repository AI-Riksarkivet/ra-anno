<script lang="ts">
  import PixiCanvas from "$lib/pixi/PixiCanvas.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import AnnotationSidebar from "$lib/components/AnnotationSidebar.svelte";
  import KeyboardShortcuts from "$lib/components/KeyboardShortcuts.svelte";
  import { statusColor } from "$lib/utils/color.js";
  import { annotationStore } from "$lib/stores/annotations.svelte.js";
  import { undoStack } from "$lib/stores/undo.svelte.js";
  import type { PixiContext } from "$lib/pixi/types.js";
  import type { Tool } from "$lib/pixi/types.js";
  import type { AnnotationStatus } from "$lib/types/schemas.js";

  let mode = $state<"view" | "edit">("view");

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let activeTool = $state<Tool>("select");
  let selectedIndex = $state<number | null>(null);
  let pixiCtx = $state<PixiContext | null>(null);

  const pageId = "mock-page-001";

  const table = $derived(annotationStore.table(pageId));

  function syncCanvas() {
    if (!pixiCtx || !table) return;
    pixiCtx.plugins.arrow.load(table);
    pixiCtx.plugins.arrow.sync();
  }

  $effect(() => {
    if (table && pixiCtx) syncCanvas();
  });

  async function handleReady(ctx: PixiContext) {
    pixiCtx = ctx;

    await ctx.plugins.image.load(`/api/images/${pageId}`);
    await annotationStore.load(pageId);

    // Drawing tool commits → append to Arrow store, auto-select the new shape
    ctx.plugins.interaction.onCommit = (shape) => {
      const updated = annotationStore.appendLocal(pageId, {
        id: crypto.randomUUID(),
        page_id: pageId,
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        polygon: shape.polygon,
        text: "",
        label: "",
        confidence: 1.0,
        source: "manual",
        status: "draft",
      });

      // Auto-switch to Select and select the new annotation
      if (updated) {
        activeTool = "select";
        ctx.plugins.interaction.setTool("select");
        const newIndex = updated.numRows - 1;
        selectedIndex = newIndex;
        ctx.plugins.interaction.select(newIndex);
      }
    };

    // Selection changes
    ctx.plugins.interaction.onSelect = (index) => {
      selectedIndex = index;
    };

    // Editor handle drags → update Arrow store
    ctx.plugins.interaction.onChange = (index, updates) => {
      annotationStore.updateLocal(pageId, index, {
        x: updates.x,
        y: updates.y,
        width: updates.w,
        height: updates.h,
        polygon: updates.polygon,
      });
    };
  }

  function handleToggleMode() {
    mode = mode === "view" ? "edit" : "view";
    pixiCtx?.plugins.interaction.setEditMode(mode === "edit");
    if (mode === "view") {
      activeTool = "select";
      pixiCtx?.plugins.interaction.setTool("select");
    }
  }

  function handleToolChange(tool: Tool) {
    activeTool = tool;
    pixiCtx?.plugins.interaction.setTool(tool);
  }

  function handleUndo() {
    annotationStore.undo(pageId);
    selectedIndex = null;
    pixiCtx?.plugins.interaction.cancel();
  }

  function handleRedo() {
    annotationStore.redo(pageId);
    selectedIndex = null;
    pixiCtx?.plugins.interaction.cancel();
  }

  async function handleSave() {
    await annotationStore.save(pageId);
  }

  function handleUpdateField(index: number, field: string, value: string) {
    annotationStore.updateLocal(pageId, index, { [field]: value });
  }

  function handleUpdateStatus(index: number, status: AnnotationStatus) {
    annotationStore.updateLocal(pageId, index, { status });
  }

  function handleDelete(index: number) {
    annotationStore.deleteLocal(pageId, index);
    selectedIndex = null;
    pixiCtx?.plugins.interaction.cancel();
  }
</script>

<svelte:window
  onkeydown={(e) => {
    // Update modifier state for drawing tools (Shift=square, Ctrl=center)
    pixiCtx?.plugins.interaction.setModifiers(e.shiftKey, e.ctrlKey || e.metaKey, e.altKey);
    // Forward to active tool (handles Escape, Backspace for polygon)
    pixiCtx?.plugins.interaction.handleKeyDown(e.key);

    if (e.key === "Escape") {
      pixiCtx?.plugins.interaction.cancel();
      selectedIndex = null;
      activeTool = "select";
      pixiCtx?.plugins.interaction.setTool("select");
    }
    if (e.key === "1") handleToolChange("select");
    if (e.key === "2") handleToolChange("rect");
    if (e.key === "3") handleToolChange("polygon");
    if (e.key === "4") handleToolChange("scissors");
    if (e.key === "5") handleToolChange("magnetic");
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      handleUndo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      handleRedo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      if (selectedIndex !== null) {
        handleDelete(selectedIndex);
      }
    }
    if (e.key === "p" && selectedIndex !== null) {
      // Convert selected rect to polygon (enables vertex editing)
      pixiCtx?.plugins.interaction.convertToPolygon();
    }
    if (e.key === "Tab" && table) {
      e.preventDefault();
      const next =
        selectedIndex === null
          ? 0
          : e.shiftKey
            ? (selectedIndex - 1 + table.numRows) % table.numRows
            : (selectedIndex + 1) % table.numRows;
      selectedIndex = next;
      pixiCtx?.plugins.interaction.select(next);
    }
  }}
  onkeyup={(e) => {
    pixiCtx?.plugins.interaction.setModifiers(e.shiftKey, e.ctrlKey || e.metaKey, e.altKey);
  }}
/>

<div class="flex h-full">
  <!-- Left: vertical toolbar -->
  <Toolbar
    {mode}
    onToggleMode={handleToggleMode}
    {activeTool}
    canUndo={undoStack.canUndo}
    canRedo={undoStack.canRedo}
    isDirty={annotationStore.isDirty(pageId)}
    annotationCount={table?.numRows ?? 0}
    onToolChange={handleToolChange}
    onUndo={handleUndo}
    onRedo={handleRedo}
    onSave={handleSave}
  />

  <!-- Center: canvas -->
  <div class="relative flex-1">
    <PixiCanvas bind:zoom bind:panX bind:panY colorFn={statusColor} onready={handleReady} />
  </div>

  <!-- Right: annotation sidebar -->
  <AnnotationSidebar
    {table}
    {selectedIndex}
    onSelect={(i) => {
      selectedIndex = i;
      pixiCtx?.plugins.interaction.select(i);
    }}
    onUpdateField={handleUpdateField}
    onUpdateStatus={handleUpdateStatus}
    onDelete={handleDelete}
  />
</div>

<KeyboardShortcuts />
