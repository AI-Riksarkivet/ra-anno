<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import type { Table } from "apache-arrow";
  import { statusColor, colorToHex } from "$lib/utils/color.js";
  import type { AnnotationStatus } from "$lib/types/schemas.js";
  import { uniqueColumnValues } from "$lib/utils/arrow.js";
  import { getContext } from "svelte";
  import { type LayerStore, LAYER_CTX } from "$lib/stores/layers.svelte.js";
  import LayerPanel from "./LayerPanel.svelte";
  import { isAxisAlignedRect } from "$lib/pixi/interaction/geometry.js";

  const layers = getContext<LayerStore>(LAYER_CTX);

  let collapsed = $state(false);
  let filterText = $state("");
  let collapsedGroups = $state(new Set<string>());
  let creatingLabel = $state(false);
  let creatingGroup = $state(false);
  let newLabelText = $state("");
  let newGroupText = $state("");

  let {
    table = null,
    selectedIndex = null,
    selectedSet = new Set<number>() as ReadonlySet<number>,
    mode = "edit",
    onSelect,
    onUpdateStatus,
    onUpdateField,
    onBulkUpdateField,
    onBulkUpdateStatus,
    onDelete,
  }: {
    table?: Table | null;
    selectedIndex?: number | null;
    selectedSet?: ReadonlySet<number>;
    mode?: "view" | "edit";
    onSelect?: (index: number | null) => void;
    onUpdateStatus?: (index: number, status: AnnotationStatus) => void;
    onUpdateField?: (index: number, field: string, value: string) => void;
    onBulkUpdateField?: (indices: ReadonlySet<number>, field: string, value: string) => void;
    onBulkUpdateStatus?: (indices: ReadonlySet<number>, status: AnnotationStatus) => void;
    onDelete?: (index: number) => void;
  } = $props();

  const isMultiSelect = $derived(selectedSet.size > 1);

  const statusClasses: Record<string, string> = {
    accepted: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
    reviewed: "bg-blue-100 text-blue-800",
    draft: "bg-amber-100 text-amber-800",
    prediction: "bg-purple-100 text-purple-800",
  };

  function getRow(index: number) {
    if (!table) return null;
    const row: Record<string, unknown> = {};
    for (const field of table.schema.fields) {
      row[field.name] = table.getChild(field.name)?.get(index);
    }
    return row;
  }

  const selected = $derived(
    selectedIndex !== null ? getRow(selectedIndex) : null,
  );

  const uniqueLabels = $derived(table ? uniqueColumnValues(table, "label") : []);
  const uniqueGroups = $derived(table ? uniqueColumnValues(table, "group") : []);

  /** Status counts for the summary bar */
  const statusCounts = $derived.by(() => {
    if (!table) return {};
    const col = table.getChild("status");
    if (!col) return {};
    const counts: Record<string, number> = {};
    for (let i = 0; i < table.numRows; i++) {
      const s = String(col.get(i) ?? "draft");
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  });

  /** Page-level metadata from Arrow schema (survives IPC round-trip) */
  const pageMeta = $derived.by(() => {
    if (!table) return null;
    const m = table.schema.metadata;
    if (!m) return null;
    // Arrow metadata is a Map — check if it has entries
    const entries: [string, string][] = [];
    m.forEach((v: string, k: string) => entries.push([k, v]));
    if (entries.length === 0) return null;
    return Object.fromEntries(entries) as Record<string, string>;
  });

  /** Annotations grouped by the current layer groupBy column, filtered by search */
  const groupedAnnotations = $derived.by(() => {
    if (!table || table.numRows === 0) return [];
    const groupByCol = layers?.groupByColumn ?? "label";
    const col = table.getChild(groupByCol);
    const textCol = table.getChild("text");
    const labelCol = table.getChild("label");
    const statusCol = table.getChild("status");
    const filter = filterText.toLowerCase();

    const groups = new Map<string, { index: number; label: string; text: string; status: string }[]>();
    for (let i = 0; i < table.numRows; i++) {
      const groupVal = String(col?.get(i) ?? "ungrouped");
      const label = String(labelCol?.get(i) ?? "");
      const text = String(textCol?.get(i) ?? "");
      const status = String(statusCol?.get(i) ?? "draft");

      // Filter by search text
      if (filter && !label.toLowerCase().includes(filter) && !text.toLowerCase().includes(filter)) {
        continue;
      }

      let arr = groups.get(groupVal);
      if (!arr) {
        arr = [];
        groups.set(groupVal, arr);
      }
      arr.push({ index: i, label, text, status });
    }

    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => ({ name, items }));
  });

  function toggleGroupCollapse(name: string) {
    const next = new Set(collapsedGroups);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    collapsedGroups = next;
  }

  /** Geometry info for the selected annotation */
  const geoInfo = $derived.by(() => {
    if (!table || selectedIndex === null) return null;
    const polyCol = table.getChild("polygon");
    const x = table.getChild("x")?.get(selectedIndex) as number;
    const y = table.getChild("y")?.get(selectedIndex) as number;
    const w = table.getChild("width")?.get(selectedIndex) as number;
    const h = table.getChild("height")?.get(selectedIndex) as number;

    let polyLength = 0;
    let isRect = true;
    if (polyCol) {
      const val = polyCol.get(selectedIndex);
      if (val && val.length >= 6) {
        polyLength = val.length / 2;
        const arr = new Array(val.length);
        for (let j = 0; j < val.length; j++) arr[j] = val.get(j);
        isRect = isAxisAlignedRect(arr);
      }
    }
    return {
      type: isRect ? "rect" : "polygon",
      vertices: isRect ? 4 : polyLength,
      x: Math.round(x),
      y: Math.round(y),
      w: Math.round(w),
      h: Math.round(h),
    };
  });
</script>

<script module lang="ts">
  import PanelRightClose from "@lucide/svelte/icons/panel-right-close";
  import PanelRightOpen from "@lucide/svelte/icons/panel-right-open";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import Search from "@lucide/svelte/icons/search";
</script>

{#snippet collapseToggle()}
  <button
    class="flex h-8 w-8 items-center justify-center rounded hover:bg-muted"
    onclick={() => (collapsed = !collapsed)}
    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
  >
    {#if collapsed}
      <PanelRightOpen class="h-4 w-4 text-muted-foreground" />
    {:else}
      <PanelRightClose class="h-4 w-4 text-muted-foreground" />
    {/if}
  </button>
{/snippet}

{#if collapsed}
  <div class="flex h-full w-10 flex-col items-center border-l bg-card pt-2">
    {@render collapseToggle()}
  </div>
{:else}
<div class="flex h-full w-72 flex-col border-l bg-card">
  <div class="flex items-center justify-between border-b px-2 py-1">
    <span class="text-xs font-medium text-muted-foreground">Annotations</span>
    {@render collapseToggle()}
  </div>

  <!-- Layer panel -->
  <LayerPanel {table} />

  <!-- Status summary bar -->
  {#if table && table.numRows > 0}
    <div class="flex items-center gap-0.5 border-b px-3 py-1.5" title="Annotation status breakdown">
      {#each ["accepted", "reviewed", "draft", "prediction", "rejected"] as s (s)}
        {@const count = statusCounts[s] ?? 0}
        {#if count > 0}
          <div
            class="h-1.5 rounded-full"
            style="flex: {count}; background-color: {colorToHex(statusColor(s))}"
            title="{s}: {count}"
          ></div>
        {/if}
      {/each}
    </div>
  {/if}

  <!-- Page metadata (from Arrow schema) -->
  {#if pageMeta}
    <details class="border-b">
      <summary class="cursor-pointer px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
        Page info
      </summary>
      <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 pb-2 text-xs">
        {#each Object.entries(pageMeta) as [key, value] (key)}
          <span class="text-muted-foreground">{key.replace(/_/g, " ")}</span>
          <span class="truncate font-mono">{value}</span>
        {/each}
      </div>
    </details>
  {/if}

  {#if isMultiSelect}
    <!-- Bulk actions panel -->
    <div class="border-b p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">{selectedSet.size} selected</span>
        <button
          class="text-xs text-muted-foreground hover:text-foreground"
          title="Deselect all annotations"
          onclick={() => onSelect?.(null)}
        >
          deselect
        </button>
      </div>
    </div>
    {#if mode === "edit"}
      <div class="flex-1 space-y-3 overflow-y-auto p-3">
        <div>
          <span class="text-xs text-muted-foreground">Set label for all</span>
          <Select
            type="single"
            onValueChange={(v) => { if (v !== undefined) onBulkUpdateField?.(selectedSet, "label", v); }}
          >
            <SelectTrigger size="sm" class="mt-1 w-full">Choose label...</SelectTrigger>
            <SelectContent>
              {#each uniqueLabels as label (label)}
                <SelectItem value={label}>{label}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
        <div>
          <span class="text-xs text-muted-foreground">Set group for all</span>
          <Select
            type="single"
            onValueChange={(v) => { if (v !== undefined) onBulkUpdateField?.(selectedSet, "group", v); }}
          >
            <SelectTrigger size="sm" class="mt-1 w-full">Choose group...</SelectTrigger>
            <SelectContent>
              {#each uniqueGroups as group (group)}
                <SelectItem value={group}>{group}</SelectItem>
              {/each}
            </SelectContent>
          </Select>
        </div>
        <Separator />
        <div class="flex flex-col gap-1.5">
          <Button variant="outline" size="sm" class="justify-start text-green-700" title="Accept all selected annotations" onclick={() => onBulkUpdateStatus?.(selectedSet, "accepted")}>Accept all</Button>
          <Button variant="outline" size="sm" class="justify-start text-red-700" title="Reject all selected annotations" onclick={() => onBulkUpdateStatus?.(selectedSet, "rejected")}>Reject all</Button>
          <Button variant="outline" size="sm" class="justify-start" title="Reset all selected to draft status" onclick={() => onBulkUpdateStatus?.(selectedSet, "draft")}>Reset all to draft</Button>
        </div>
      </div>
    {/if}
  {:else if selected && selectedIndex !== null}
    <div class="border-b p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Annotation #{selectedIndex}</span>
        <button
          class="text-xs text-muted-foreground hover:text-foreground"
          title="Close annotation detail"
          onclick={() => onSelect?.(null)}
        >
          close
        </button>
      </div>
    </div>

    <div class="flex-1 space-y-3 overflow-y-auto p-3">
      <div>
        <span class="text-xs text-muted-foreground">Text</span>
        {#if mode === "edit"}
          <textarea
            class="mt-1 min-h-[60px] w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            placeholder="Transcription..."
            value={String(selected.text || "")}
            onchange={(e) => onUpdateField?.(selectedIndex, "text", e.currentTarget.value)}
          ></textarea>
        {:else}
          <p class="mt-1 text-sm">{String(selected.text || "—")}</p>
        {/if}
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Label</span>
        {#if mode === "edit"}
          {#if creatingLabel}
            <input
              class="mt-1 h-8 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="New label name..."
              bind:value={newLabelText}
              onkeydown={(e) => {
                if (e.key === "Enter" && newLabelText.trim()) {
                  onUpdateField?.(selectedIndex, "label", newLabelText.trim());
                  creatingLabel = false;
                  newLabelText = "";
                }
                if (e.key === "Escape") { creatingLabel = false; newLabelText = ""; }
              }}
              onblur={() => { creatingLabel = false; newLabelText = ""; }}
            />
          {:else}
            <Select
              type="single"
              value={String(selected.label || "")}
              onValueChange={(v) => {
                if (v === "__new__") { creatingLabel = true; return; }
                if (v !== undefined) onUpdateField?.(selectedIndex, "label", v);
              }}
            >
              <SelectTrigger size="sm" class="mt-1 w-full">{String(selected.label || "Select label...")}</SelectTrigger>
              <SelectContent>
                {#each uniqueLabels as label (label)}
                  <SelectItem value={label}>{label}</SelectItem>
                {/each}
                <SelectItem value="__new__">+ New label...</SelectItem>
              </SelectContent>
            </Select>
          {/if}
        {:else}
          <p class="mt-1 text-sm">{String(selected.label || "—")}</p>
        {/if}
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Group</span>
        {#if mode === "edit"}
          {#if creatingGroup}
            <input
              class="mt-1 h-8 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="New group name..."
              bind:value={newGroupText}
              onkeydown={(e) => {
                if (e.key === "Enter" && newGroupText.trim()) {
                  onUpdateField?.(selectedIndex, "group", newGroupText.trim());
                  creatingGroup = false;
                  newGroupText = "";
                }
                if (e.key === "Escape") { creatingGroup = false; newGroupText = ""; }
              }}
              onblur={() => { creatingGroup = false; newGroupText = ""; }}
            />
          {:else}
            <Select
              type="single"
              value={String(selected.group || "")}
              onValueChange={(v) => {
                if (v === "__new__") { creatingGroup = true; return; }
                if (v !== undefined) onUpdateField?.(selectedIndex, "group", v);
              }}
            >
              <SelectTrigger size="sm" class="mt-1 w-full">{String(selected.group || "Select group...")}</SelectTrigger>
              <SelectContent>
                {#each uniqueGroups as group (group)}
                  <SelectItem value={group}>{group}</SelectItem>
                {/each}
                <SelectItem value="__new__">+ New group...</SelectItem>
              </SelectContent>
            </Select>
          {/if}
        {:else}
          <p class="mt-1 text-sm">{String(selected.group || "—")}</p>
        {/if}
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Confidence</span>
        <p class="text-sm">
          {typeof selected.confidence === "number"
            ? (selected.confidence * 100).toFixed(1) + "%"
            : "—"}
        </p>
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Source</span>
        <p class="text-sm">{selected.source || "—"}</p>
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Status</span>
        <Badge class={statusClasses[String(selected.status)] ?? ""}>
          {String(selected.status)}
        </Badge>
      </div>

      {#if geoInfo}
        <div>
          <span class="text-xs text-muted-foreground">Geometry</span>
          <p class="text-xs font-mono text-muted-foreground">
            {geoInfo.type} ({geoInfo.vertices} pts) &middot; {geoInfo.x},{geoInfo.y} {geoInfo.w}&times;{geoInfo.h}
          </p>
        </div>
      {/if}

      {#if mode === "edit"}
        <Separator />

        <div class="flex flex-col gap-1.5">
          <Button
            variant="outline"
            size="sm"
            class="justify-start text-green-700"
            title="Mark annotation as accepted"
            onclick={() => onUpdateStatus?.(selectedIndex, "accepted")}
          >
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="justify-start text-red-700"
            title="Mark annotation as rejected"
            onclick={() => onUpdateStatus?.(selectedIndex, "rejected")}
          >
            Reject
          </Button>
          <Button
            variant="outline"
            size="sm"
            class="justify-start"
            title="Reset annotation to draft status"
            onclick={() => onUpdateStatus?.(selectedIndex, "draft")}
          >
            Reset to Draft
          </Button>
          <Separator />
          <Button
            variant="destructive"
            size="sm"
            title="Delete this annotation (Delete key)"
            onclick={() => onDelete?.(selectedIndex)}
          >
            Delete
          </Button>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Collapsible annotation list section -->
    <details class="flex min-h-0 flex-1 flex-col" open>
      <summary class="flex cursor-pointer items-center gap-2 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
        Annotations
        <span class="ml-auto tabular-nums">{table?.numRows ?? 0}</span>
      </summary>

      <div class="flex min-h-0 flex-1 flex-col">
        <!-- Search filter -->
        <div class="flex items-center gap-2 border-b px-3 py-1.5">
          <Search class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            class="h-6 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            placeholder="Filter..."
            bind:value={filterText}
          />
        </div>

        <!-- Grouped annotation list -->
        <div class="flex-1 overflow-y-auto p-1.5">
          {#if groupedAnnotations.length > 0}
            <div class="flex flex-col gap-1">
              {#each groupedAnnotations as group (group.name)}
                {@const isCollapsed = collapsedGroups.has(group.name)}
                <div class="overflow-hidden rounded-md border bg-card">
                  <!-- Group header -->
                  <button
                    class="flex w-full items-center gap-1.5 bg-muted/50 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground hover:bg-muted/80"
                    onclick={() => toggleGroupCollapse(group.name)}
                  >
                    {#if isCollapsed}
                      <ChevronRight class="h-3 w-3 shrink-0" />
                    {:else}
                      <ChevronDown class="h-3 w-3 shrink-0" />
                    {/if}
                    <span class="flex-1 truncate">{group.name || "ungrouped"}</span>
                    <span class="tabular-nums text-[10px]">{group.items.length}</span>
                  </button>

                  <!-- Group items -->
                  {#if !isCollapsed}
                    <div class="divide-y divide-border/50">
                      {#each group.items as ann (ann.index)}
                        <button
                          class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-accent/50"
                          class:bg-accent={selectedIndex === ann.index}
                          onclick={() => onSelect?.(ann.index)}
                        >
                          <span
                            class="h-2 w-2 shrink-0 rounded-full"
                            style="background-color: {colorToHex(statusColor(ann.status))}"
                          ></span>
                          <div class="flex-1 overflow-hidden">
                            <p class="truncate text-xs font-medium">{ann.label || "unlabeled"}</p>
                            {#if ann.text}
                              <p class="truncate text-[11px] text-muted-foreground">{ann.text}</p>
                            {/if}
                          </div>
                          <Badge class="shrink-0 scale-90 {statusClasses[ann.status] ?? ''}">{ann.status}</Badge>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/each}
            </div>
          {:else if filterText}
            <p class="p-3 text-sm text-muted-foreground">No matches</p>
          {:else}
            <p class="p-3 text-sm text-muted-foreground">No annotations</p>
          {/if}
        </div>
      </div>
    </details>
  {/if}
</div>
{/if}
