<script lang="ts">
  import PixiCanvas from "$lib/pixi/PixiCanvas.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import AnnotationSidebar from "$lib/components/AnnotationSidebar.svelte";
  import KeyboardShortcuts from "$lib/components/KeyboardShortcuts.svelte";
  import { statusColor } from "$lib/utils/color.js";
  import { annotationStore } from "$lib/stores/annotations.svelte.js";
  import { LayerStore, LAYER_CTX } from "$lib/stores/layers.svelte.js";
  import { setContext } from "svelte";
  import type { PixiContext } from "$lib/pixi/types.js";
  import type { Tool } from "$lib/pixi/types.js";
  import type { AnnotationStatus } from "$lib/types/schemas.js";

  const layerStore = new LayerStore();
  setContext(LAYER_CTX, layerStore);

  let mode = $state<"view" | "edit">("view");

  let zoom = $state(1);
  let panX = $state(0);
  let panY = $state(0);
  let activeTool = $state<Tool>("select");
  let selectedIndex = $state<number | null>(null);
  let selectedSet = $state<ReadonlySet<number>>(new Set());
  let pixiCtx = $state<PixiContext | null>(null);
  let hasGeometryEdits = $state(false);

  const pageId = "mock-page-001";

  // Materialized table (base + overlays) — for sidebar UI
  const table = $derived(annotationStore.table(pageId));
  // Server table (stable reference) — for Pixi rendering (zero-copy Float32 views)
  const serverTable = $derived(annotationStore.serverTable(pageId));

  // Pixi reads from the server table (stable, zero-copy).
  // Only re-syncs when server table changes (load/save) or layer config changes.
  // Field edits (label, text, status) do NOT trigger Pixi re-sync.
  $effect(() => {
    if (!pixiCtx) return;
    const t = serverTable;
    const hidden = layerStore.hiddenGroups;
    const groupBy = layerStore.groupByColumn;
    const colors = layerStore.groupColors;

    if (t) pixiCtx.plugins.arrow.load(t);
    pixiCtx.plugins.arrow.setLayerConfig({
      hiddenGroups: hidden,
      groupByColumn: groupBy,
      groupColors: colors,
    });
    pixiCtx.plugins.arrow.sync();
  });

  async function handleReady(ctx: PixiContext) {
    pixiCtx = ctx;

    // Init mode — view by default, no editing until toggled
    ctx.plugins.interaction.setEditMode(mode === "edit");

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
        reviewer: "",
        group: "",
        metadata: "{}",
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

    // Selection changes (single or multi via Ctrl+Click / lasso)
    ctx.plugins.interaction.onSelect = (index) => {
      selectedIndex = index;
      selectedSet = new Set(ctx.plugins.interaction.getSelectedSet());
    };

    // Dirty overlay changes
    ctx.plugins.interaction.onDirtyChange = (dirty) => {
      hasGeometryEdits = dirty;
    };

    // Editor handle drags → dirty overlay (NO Arrow table rebuild)
    // Arrow table only rebuilt on Save
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

  function handleResetView() {
    pixiCtx?.plugins.image.resetView();
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
    // Apply dirty geometry overrides to Arrow table before saving
    // Uses batchUpdateLocal: single table rebuild + single undo entry
    if (pixiCtx) {
      const overrides = pixiCtx.plugins.arrow.getDirtyOverrides();
      if (overrides.size > 0) {
        const updatesMap = new Map<number, Record<string, unknown>>();
        for (const [index, geo] of overrides) {
          updatesMap.set(index, {
            x: geo.x,
            y: geo.y,
            width: geo.w,
            height: geo.h,
            polygon: geo.polygon,
          });
        }
        annotationStore.batchUpdateLocal(pageId, updatesMap);
      }
      pixiCtx.plugins.arrow.clearOverrides();
      hasGeometryEdits = false;
    }
    await annotationStore.save(pageId);
  }

  function handleUpdateField(index: number, field: string, value: string) {
    annotationStore.updateLocal(pageId, index, { [field]: value });
    // Patch Pixi's cached strings if this field affects rendering (color/grouping)
    pixiCtx?.plugins.arrow.setFieldOverride(index, field, value);
    pixiCtx?.plugins.arrow.sync();
  }

  function handleUpdateStatus(index: number, status: AnnotationStatus) {
    annotationStore.updateLocal(pageId, index, { status });
    pixiCtx?.plugins.arrow.setFieldOverride(index, "status", status);
    pixiCtx?.plugins.arrow.sync();
  }

  function handleBulkUpdateField(
    indices: ReadonlySet<number>,
    field: string,
    value: string,
  ) {
    const updatesMap = new Map<number, Record<string, unknown>>();
    for (const idx of indices) updatesMap.set(idx, { [field]: value });
    annotationStore.batchUpdateLocal(pageId, updatesMap);
  }

  function handleBulkUpdateStatus(
    indices: ReadonlySet<number>,
    status: AnnotationStatus,
  ) {
    const updatesMap = new Map<number, Record<string, unknown>>();
    for (const idx of indices) updatesMap.set(idx, { status });
    annotationStore.batchUpdateLocal(pageId, updatesMap);
  }

  function handleDelete(index: number) {
    pixiCtx?.plugins.arrow.adjustOverridesForDelete(index);
    annotationStore.deleteLocal(pageId, index);
    selectedIndex = null;
    selectedSet = new Set();
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
    if (e.key === "0") handleToolChange("pan");
    if (e.key === "1") handleToolChange("select");
    if (e.key === "6") handleToolChange("lasso");
    if (mode === "edit") {
      if (e.key === "2") handleToolChange("rect");
      if (e.key === "3") handleToolChange("polygon");
      if (e.key === "4") handleToolChange("scissors");
      if (e.key === "5") handleToolChange("magnetic");
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
      e.preventDefault();
      if (mode === "edit") handleUndo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
      e.preventDefault();
      if (mode === "edit") handleRedo();
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (mode === "edit") handleSave();
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      // Only delete annotation in select mode — drawing tools handle Backspace themselves
      if (selectedIndex !== null && activeTool === "select") {
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
  <!-- Left: vertical toolbar (always visible — select/lasso in view, all tools in edit) -->
  <Toolbar
    {mode}
    onToggleMode={handleToggleMode}
    {activeTool}
    canUndo={annotationStore.canUndo}
    canRedo={annotationStore.canRedo}
    isDirty={annotationStore.isDirty(pageId) || hasGeometryEdits}
    annotationCount={table?.numRows ?? 0}
    onToolChange={handleToolChange}
    onUndo={handleUndo}
    onRedo={handleRedo}
    onSave={handleSave}
    onResetView={handleResetView}
  />

  <!-- Center: canvas + floating controls -->
  <div class="relative flex-1">
    <PixiCanvas bind:zoom bind:panX bind:panY colorFn={statusColor} onready={handleReady} />

    <!-- Floating view/edit toggle -->
    <div class="absolute left-2 top-2 z-10">
      <button
        class="flex h-8 items-center gap-1.5 rounded-md border bg-background/90 px-2.5 text-xs shadow-sm backdrop-blur-sm hover:bg-accent"
        onclick={handleToggleMode}
      >
        {#if mode === "view"}
          <span class="h-2 w-2 rounded-full bg-green-500"></span>
          View
        {:else}
          <span class="h-2 w-2 rounded-full bg-blue-500"></span>
          Edit
        {/if}
      </button>
    </div>
  </div>

  <!-- Right: annotation sidebar -->
  <AnnotationSidebar
    {table}
    {selectedIndex}
    {selectedSet}
    onSelect={(i) => {
      selectedIndex = i;
      selectedSet = new Set();
      pixiCtx?.plugins.interaction.select(i);
    }}
    onUpdateField={handleUpdateField}
    onUpdateStatus={handleUpdateStatus}
    onBulkUpdateField={handleBulkUpdateField}
    onBulkUpdateStatus={handleBulkUpdateStatus}
    onDelete={handleDelete}
  />
</div>

<KeyboardShortcuts />
