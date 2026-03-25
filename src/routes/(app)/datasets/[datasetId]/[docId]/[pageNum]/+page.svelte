<script lang="ts">
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import PixiCanvas from "$lib/pixi/PixiCanvas.svelte";
  import Toolbar from "$lib/components/Toolbar.svelte";
  import DisplayPanel from "$lib/components/DisplayPanel.svelte";
  import ZoomControls from "$lib/components/ZoomControls.svelte";
  import PageGallery from "$lib/components/PageGallery.svelte";
  import AnnotationSidebar from "$lib/components/AnnotationSidebar.svelte";
  import KeyboardShortcuts from "$lib/components/KeyboardShortcuts.svelte";
  import { statusColor } from "$lib/utils/color.js";
  import { annotationStore } from "$lib/stores/annotations.svelte.js";
  import { LayerStore, LAYER_CTX } from "$lib/stores/layers.svelte.js";
  import { setContext, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import type { PixiContext } from "$lib/pixi/types.js";
  import type { Tool } from "$lib/pixi/types.js";
  import type { AnnotationStatus } from "$lib/types/schemas.js";

  const { data } = $props();

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
  let displayOpen = $state(false);
  let galleryOpen = $state(false);
  let splitOpen = $state(false);

  // Cached page image bytes — avoids re-fetch on split toggle
  let cachedImageBytes: Uint8Array | null = null;
  let cachedImageMime = "image/png";

  const pageId = $derived(data.pageId);

  // Materialized table (base + overlays) — for sidebar UI
  const table = $derived(annotationStore.table(pageId));
  // Structural version — only changes on append/delete/load/save (not field edits)
  const structVersion = $derived(annotationStore.structuralVersion(pageId));

  // Pixi syncs ONLY on structural changes (append/delete/load/save) or layer config
  // Field edits (label, text, status) are patched via setFieldOverride — no full re-sync
  $effect(() => {
    if (!pixiCtx) return;
    const _sv = structVersion; // triggers on structural changes only
    const hidden = layerStore.hiddenGroups;
    const groupBy = layerStore.groupByColumn;
    const colors = layerStore.groupColors;

    // Read the materialized table WITHOUT creating a dependency on it
    const t = untrack(() => annotationStore.table(pageId));
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

    // Load page image (from cache if available, else fetch)
    const loadImage = (async () => {
      try {
        if (cachedImageBytes) {
          await ctx.plugins.image.loadFromBytes(cachedImageBytes, cachedImageMime);
        } else {
          const pageRes = await fetch(`/api/pages/${pageId}`);
          if (!pageRes.ok) return;
          const { tableFromIPC: parseIPC } = await import("apache-arrow");
          const pageTable = parseIPC(
            new Uint8Array(await pageRes.arrayBuffer()),
          );
          const imageCol = pageTable.getChild("image");
          const mimeCol = pageTable.getChild("image_mime");
          if (imageCol) {
            cachedImageMime = String(mimeCol?.get(0) ?? "image/png");
            const idata = imageCol.data[0];
            const offsets = idata.valueOffsets;
            const values = idata.values;
            if (offsets && values && offsets.length > 1) {
              // Copy the bytes so they survive Arrow table GC
              cachedImageBytes = new Uint8Array(values.subarray(offsets[0], offsets[1]));
              await ctx.plugins.image.loadFromBytes(cachedImageBytes, cachedImageMime);
            }
          }
        }
      } catch (e) {
        console.error("Page image load failed:", e);
      }
    })();

    // Load annotations (cached in store — returns instantly if already loaded)
    const loadAnnotations = annotationStore.load(pageId);

    await Promise.all([loadImage, loadAnnotations]);

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
    if (mode === "edit") {
      displayOpen = false;
      galleryOpen = false;
    }
    if (mode === "view") {
      activeTool = "select";
      pixiCtx?.plugins.interaction.setTool("select");
    }
  }

  function handleToolChange(tool: Tool) {
    activeTool = tool;
    pixiCtx?.plugins.interaction.setTool(tool);
  }

  const currentPageIndex = $derived(data.pages.findIndex((p: { page_num: number }) => p.page_num === data.pageNum));

  function handlePrevPage() {
    if (currentPageIndex > 0) {
      goto(`/datasets/${data.datasetId}/${data.docId}/${data.pages[currentPageIndex - 1].page_num}`);
    }
  }

  function handleNextPage() {
    if (currentPageIndex < data.pages.length - 1) {
      goto(`/datasets/${data.datasetId}/${data.docId}/${data.pages[currentPageIndex + 1].page_num}`);
    }
  }

  function handleZoomIn() {
    pixiCtx?.plugins.image.zoomIn();
  }

  function handleZoomOut() {
    pixiCtx?.plugins.image.zoomOut();
  }

  function handleResetView() {
    pixiCtx?.plugins.image.resetView();
  }

  function handleImageChange(brightness: number, contrast: number, saturation: number) {
    pixiCtx?.plugins.image.setImageAdjustments(brightness, contrast, saturation);
  }

  function handleStyleChange(style: { fillAlpha: number; strokeWidth: number; strokeAlpha: number }) {
    pixiCtx?.plugins.arrow.setStyle(style);
    pixiCtx?.plugins.arrow.sync();
  }

  function handleHeatmapChange(column: string | null) {
    pixiCtx?.plugins.arrow.setHeatmap(column);
    pixiCtx?.plugins.arrow.sync();
  }

  const arrowColumns = $derived(pixiCtx?.plugins.arrow.getColumnInfo() ?? []);

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
    // Patch Pixi's cached strings for rendering-relevant fields (no full re-sync)
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
    // Page navigation: Alt+Arrow always, plain Arrow when no text input focused
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const inInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (e.altKey || !inInput) {
        e.preventDefault();
        if (e.key === "ArrowLeft") handlePrevPage();
        else handleNextPage();
      }
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
  <!-- Left: toolbar (fixed width) -->
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
    {displayOpen}
    onToggleDisplay={() => (displayOpen = !displayOpen)}
    {galleryOpen}
    onToggleGallery={() => (galleryOpen = !galleryOpen)}
    splitOpen={false}
    onToggleSplit={() => { /* TODO: native Pixi split view */ }}
  />

  <!-- Center + Right: resizable -->
  <Resizable.PaneGroup direction="horizontal" class="min-w-0 flex-1">
    <Resizable.Pane defaultSize={75} minSize={40}>
      <!-- Center: canvas -->
      <div class="relative h-full">
        <PixiCanvas bind:zoom bind:panX bind:panY colorFn={statusColor} onready={handleReady} />

        <!-- Display drawer overlay (top-left, over canvas) -->
        {#if displayOpen}
          <div class="absolute left-0 top-0 z-20 h-full">
            <DisplayPanel
              open={displayOpen}
              columns={arrowColumns}
              onClose={() => (displayOpen = false)}
              onImageChange={handleImageChange}
              onStyleChange={handleStyleChange}
              onHeatmapChange={handleHeatmapChange}
            />
          </div>
        {/if}

        <!-- Gallery drawer overlay (bottom, over canvas) -->
        <PageGallery
          open={galleryOpen}
          pages={data.pages}
          currentPageNum={data.pageNum}
          datasetId={data.datasetId}
          onNavigate={(pageNum) => goto(`/datasets/${data.datasetId}/${data.docId}/${pageNum}`)}
        />

        <!-- Floating zoom + pagination controls (bottom-right) -->
        <div class="absolute bottom-2 right-2 z-10">
          <ZoomControls
            zoom={pixiCtx?.plugins.image.zoomPercent ?? 1}
            currentPage={data.pageNum}
            totalPages={data.totalPages}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetView={handleResetView}
            onPrevPage={handlePrevPage}
            onNextPage={handleNextPage}
          />
        </div>
      </div>
    </Resizable.Pane>

    <Resizable.Handle />

    <Resizable.Pane defaultSize={25} minSize={15} maxSize={45}>
      <!-- Right: annotation sidebar (resizable) -->
      <AnnotationSidebar
        {table}
        {pageId}
        {selectedIndex}
        {selectedSet}
        {mode}
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
    </Resizable.Pane>
  </Resizable.PaneGroup>
</div>

<KeyboardShortcuts />
