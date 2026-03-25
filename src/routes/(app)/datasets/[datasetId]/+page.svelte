<script lang="ts">
  import { page } from "$app/state";
  import { bulk_update_pages } from "$lib/bulk-update.remote";
  import AnimatedGradientText from "$lib/components/magic/animated-gradient-text/animated-gradient-text.svelte";
  import ScatterPlot from "$lib/components/ScatterPlot.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import Check from "@lucide/svelte/icons/check";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import Filter from "@lucide/svelte/icons/filter";
  import Grid2x2 from "@lucide/svelte/icons/grid-2x2";
  import Hash from "@lucide/svelte/icons/hash";
  import List from "@lucide/svelte/icons/list";
  import Minus from "@lucide/svelte/icons/minus";
  import Pencil from "@lucide/svelte/icons/pencil";
  import Plus from "@lucide/svelte/icons/plus";
  import Type from "@lucide/svelte/icons/type";
  import ScatterChart from "@lucide/svelte/icons/scatter-chart";
  import Search from "@lucide/svelte/icons/search";
  import Tags from "@lucide/svelte/icons/tags";
  import X from "@lucide/svelte/icons/x";

  interface ColumnDef {
    name: string;
    type: string;
    values?: readonly string[];
    min?: number;
    max?: number;
  }

  interface PageItem {
    page_id: string;
    doc_id: string;
    page_num: number;
    width: number;
    height: number;
    annotation_count: number;
    status: string;
    label: string;
    doc_type: string;
    umap_x: number;
    umap_y: number;
    [key: string]: unknown;
  }

  const datasetId = $derived(page.params.datasetId);

  let pages = $state<PageItem[]>([]);
  let columns = $state<ColumnDef[]>([]);
  let total = $state(0);
  let loading = $state(true);

  // Scatter plot: all pages (fetched once for the plot)
  let allPages = $state<PageItem[]>([]);
  let showFilters = $state(true);
  let showScatter = $state(false);
  let showStats = $state(false);
  let scatterSelection = $state<Set<string>>(new Set());
  let colorBy = $state<"status" | "label" | "doc_type">("doc_type");

  // View mode
  let viewMode = $state<"grid" | "table">("grid");
  let gridSize = $state(3); // 1=large, 2=medium, 3=default, 4=small, 5=tiny
  let showCardLabels = $state(true);
  let showCardBadges = $state(false);

  // Pop-out embeddings window
  let embeddingsPopped = $state(false);
  let popX = $state(100);
  let popY = $state(100);
  let popW = $state(420);
  let popH = $state(460);
  let dragging = $state(false);
  let dragOffset = $state({ x: 0, y: 0 });
  let resizing = $state(false);
  let resizeStart = $state({ x: 0, y: 0, w: 0, h: 0 });

  function startDrag(e: MouseEvent) {
    dragging = true;
    dragOffset = { x: e.clientX - popX, y: e.clientY - popY };
    e.preventDefault();
  }

  function startResize(e: MouseEvent) {
    resizing = true;
    resizeStart = { x: e.clientX, y: e.clientY, w: popW, h: popH };
    e.preventDefault();
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (dragging) {
      popX = e.clientX - dragOffset.x;
      popY = e.clientY - dragOffset.y;
    }
    if (resizing) {
      popW = Math.max(300, resizeStart.w + (e.clientX - resizeStart.x));
      popH = Math.max(300, resizeStart.h + (e.clientY - resizeStart.y));
    }
  }

  function handleWindowMouseUp() {
    dragging = false;
    resizing = false;
  }

  function popOutEmbeddings() {
    embeddingsPopped = true;
    showScatter = false;
  }

  function dockEmbeddings() {
    embeddingsPopped = false;
    showScatter = true;
  }

  const gridColsClass = $derived(
    [
      "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",                         // 1 = large
      "grid-cols-3 sm:grid-cols-4 md:grid-cols-6",                         // 2 = medium
      "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8",          // 3 = default
      "grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10",         // 4 = small
      "grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12",        // 5 = tiny
    ][gridSize - 1] ?? "grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8",
  );

  // Bulk label mode
  let bulkMode = $state(false);
  let checkedIds = $state<Set<string>>(new Set());
  let bulkSubmitting = $state(false);
  let bulkForm = $state<Record<string, string>>({});
  let customFieldName = $state("");
  let customFieldValue = $state("");

  const checkedCount = $derived(checkedIds.size);
  const allCheckedOnPage = $derived(
    pages.length > 0 && pages.every((p) => checkedIds.has(p.page_id)),
  );

  function toggleChecked(id: string) {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    checkedIds = next;
  }

  function toggleAllOnPage() {
    const next = new Set(checkedIds);
    if (allCheckedOnPage) {
      for (const p of pages) next.delete(p.page_id);
    } else {
      for (const p of pages) next.add(p.page_id);
    }
    checkedIds = next;
  }

  function clearChecked() {
    checkedIds = new Set();
    bulkForm = {};
    bulkMode = false;
  }

  function toggleBulkMode() {
    bulkMode = !bulkMode;
    if (!bulkMode) {
      checkedIds = new Set();
      bulkForm = {};
    }
  }

  async function submitBulkLabel() {
    const updates: Record<string, string> = {};
    for (const [key, val] of Object.entries(bulkForm)) {
      if (val) updates[key] = val;
    }
    if (Object.keys(updates).length === 0) return;

    bulkSubmitting = true;
    try {
      await bulk_update_pages({
        dataset_id: datasetId ?? "",
        page_ids: [...checkedIds],
        updates,
      });

      // Update local data optimistically
      for (const p of allPages) {
        if (checkedIds.has(p.page_id)) {
          for (const [key, val] of Object.entries(updates)) {
            (p as Record<string, unknown>)[key] = val;
          }
        }
      }
      for (const p of pages) {
        if (checkedIds.has(p.page_id)) {
          for (const [key, val] of Object.entries(updates)) {
            (p as Record<string, unknown>)[key] = val;
          }
        }
      }
      allPages = [...allPages];
      pages = [...pages];
      clearChecked();
    } finally {
      bulkSubmitting = false;
    }
  }

  // Search
  let searchQuery = $state("");
  let searchDebounced = $state("");
  let searchTimer: ReturnType<typeof setTimeout>;

  // Filters — multi-select per enum column
  let activeFilters = $state<Record<string, string[]>>({});
  // Range filters for numeric columns — { col: [min, max] }
  let rangeFilters = $state<Record<string, [number, number]>>({});

  // Sort
  let sortColumn = $state("page_num");
  let sortOrder = $state<"asc" | "desc">("asc");

  // Pagination
  let currentPage = $state(0);
  const pageSize = 48;
  const totalPages = $derived(Math.ceil(total / pageSize));

  // Enum columns for filter dropdowns
  const enumColumns = $derived(columns.filter((c) => c.type === "enum"));
  // Numeric columns with min/max (for range sliders)
  const numericColumns = $derived(
    columns.filter((c) => c.type === "number" && c.min !== undefined && c.max !== undefined),
  );
  // Sortable columns (everything except umap)
  const sortableColumns = $derived(
    columns.filter((c) => c.name !== "umap_x" && c.name !== "umap_y"),
  );

  // Total number of active filter values
  const filterCount = $derived(
    Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0)
    + Object.keys(rangeFilters).length,
  );

  // Client-side filtered pages (for scatter highlighting + stats)
  const filteredPages = $derived.by(() => {
    let result = allPages;
    // Apply search
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase();
      result = result.filter(
        (p) => p.page_id.toLowerCase().includes(q) || p.doc_id.toLowerCase().includes(q),
      );
    }
    // Apply enum filters
    for (const [key, vals] of Object.entries(activeFilters)) {
      if (vals.length > 0) {
        result = result.filter((p) => vals.includes(String(p[key])));
      }
    }
    // Apply range filters
    for (const [key, [min, max]] of Object.entries(rangeFilters)) {
      result = result.filter((p) => {
        const v = p[key] as number;
        return v >= min && v <= max;
      });
    }
    // Apply scatter selection
    if (scatterSelection.size > 0) {
      result = result.filter((p) => scatterSelection.has(p.page_id));
    }
    return result;
  });

  // IDs of pages matching current filters (for scatter plot highlighting)
  const filteredIds = $derived(new Set(filteredPages.map((p) => p.page_id)));

  // Stats: annotation count histogram
  const annotationHistogram = $derived.by(() => {
    const buckets = [
      { label: "0-20", min: 0, max: 20, count: 0 },
      { label: "21-35", min: 21, max: 35, count: 0 },
      { label: "36-50", min: 36, max: 50, count: 0 },
      { label: "51-65", min: 51, max: 65, count: 0 },
      { label: "66-80", min: 66, max: 80, count: 0 },
    ];
    for (const p of filteredPages) {
      for (const b of buckets) {
        if (p.annotation_count >= b.min && p.annotation_count <= b.max) {
          b.count++;
          break;
        }
      }
    }
    return buckets;
  });

  // Stats: breakdown by category
  function countBy(items: PageItem[], key: string): { label: string; count: number }[] {
    const map = new Map<string, number>();
    for (const item of items) {
      const val = String(item[key]);
      map.set(val, (map.get(val) ?? 0) + 1);
    }
    return [...map.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  }

  const statusBreakdown = $derived(countBy(filteredPages, "status"));
  const labelBreakdown = $derived(countBy(filteredPages, "label"));
  const docTypeBreakdown = $derived(countBy(filteredPages, "doc_type"));

  const statusColors: Record<string, string> = {
    accepted: "bg-green-500",
    reviewed: "bg-blue-500",
    draft: "bg-amber-500",
    prediction: "bg-purple-500",
    rejected: "bg-red-500",
  };

  function debounceSearch(value: string) {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      searchDebounced = value;
      currentPage = 0;
    }, 300);
  }

  function toggleFilter(column: string, value: string) {
    const current = activeFilters[column] ?? [];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    if (next.length === 0) {
      const { [column]: _, ...rest } = activeFilters;
      activeFilters = rest;
    } else {
      activeFilters = { ...activeFilters, [column]: next };
    }
    currentPage = 0;
  }

  function clearFilters() {
    activeFilters = {};
    rangeFilters = {};
    searchDebounced = "";
    searchQuery = "";
    scatterSelection = new Set();
    currentPage = 0;
  }

  function toggleSort(column: string) {
    if (sortColumn === column) {
      sortOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      sortColumn = column;
      sortOrder = "asc";
    }
  }

  function handleScatterSelect(ids: Set<string>) {
    scatterSelection = ids;
    currentPage = 0;
  }

  // Fetch all pages once for the scatter plot
  $effect(() => {
    const _dataset = datasetId;
    fetch(`/api/thumbnails/${_dataset}?limit=10000`)
      .then((r) => r.json())
      .then((data) => {
        allPages = data.pages;
      });
  });

  // Fetch paginated gallery data (reacts to filters, search, scatter selection, etc.)
  $effect(() => {
    const _dataset = datasetId;
    const _search = searchDebounced;
    const _filters = activeFilters;
    const _ranges = rangeFilters;
    const _sort = sortColumn;
    const _order = sortOrder;
    const _page = currentPage;
    const _scatterIds = scatterSelection;

    loading = true;
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(_page * pageSize));
    params.set("sort", _sort);
    params.set("order", _order);
    if (_search) params.set("q", _search);
    for (const [key, vals] of Object.entries(_filters)) {
      if (vals.length > 0) params.set(key, vals.join(","));
    }
    for (const [key, [min, max]] of Object.entries(_ranges)) {
      params.set(`${key}_min`, String(min));
      params.set(`${key}_max`, String(max));
    }
    if (_scatterIds.size > 0) {
      params.set("page_ids", [..._scatterIds].join(","));
    }

    fetch(`/api/thumbnails/${_dataset}?${params}`)
      .then((r) => r.json())
      .then((data) => {
        pages = data.pages;
        total = data.total;
        if (data.columns) columns = data.columns;
        loading = false;
      });
  });
</script>

<Resizable.PaneGroup direction="horizontal" class="h-full">
  <Resizable.Pane defaultSize={showScatter ? 25 : 15} minSize={12} maxSize={45}>
  <!-- Left panel: search, filters & scatter plot -->
  <div class="flex h-full flex-col overflow-y-auto bg-background">
    <div class="p-3 pb-2">
      <div class="relative">
        <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          class="h-8 pl-7 text-xs"
          placeholder="Search pages..."
          value={searchQuery}
          oninput={(e) => {
            searchQuery = e.currentTarget.value;
            debounceSearch(searchQuery);
          }}
        />
      </div>
    </div>

    <Separator />

    <!-- Filters section (collapsible) -->
    <div class="px-3 pt-2">
      <button
        class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
        onclick={() => (showFilters = !showFilters)}
      >
        <Filter class="h-3 w-3" />
        Filters
        {#if filterCount > 0}
          <Badge variant="secondary" class="h-4 px-1 text-[10px]">{filterCount}</Badge>
        {/if}
        <ChevronDown class="ml-auto h-3 w-3 transition-transform {showFilters ? '' : '-rotate-90'}" />
      </button>
    </div>
    {#if showFilters}
      <div class="px-3 pb-2">
        <!-- Sort -->
        <div class="mb-3">
          <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Sort by</span>
          <div class="flex gap-1">
            <select
              class="h-7 flex-1 rounded-md border border-border bg-background px-2 text-xs"
              value={sortColumn}
              onchange={(e) => { sortColumn = e.currentTarget.value; currentPage = 0; }}
            >
              {#each sortableColumns as col (col.name)}
                <option value={col.name}>{col.name.replace("_", " ")}</option>
              {/each}
            </select>
            <Button
              variant="outline"
              size="sm"
              class="h-7 w-7 p-0"
              onclick={() => { sortOrder = sortOrder === "asc" ? "desc" : "asc"; }}
              title={sortOrder === "asc" ? "Ascending" : "Descending"}
            >
              <ArrowUpDown class="h-3 w-3" />
            </Button>
          </div>
        </div>

        <!-- Enum filters -->
        {#each enumColumns as col (col.name)}
          <div class="mb-2">
            <span class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{col.name.replace("_", " ")}</span>
            <div class="flex flex-wrap gap-1">
              {#each col.values ?? [] as val (val)}
                {@const isActive = (activeFilters[col.name] ?? []).includes(val)}
                <Button
                  variant={isActive ? "default" : "outline"}
                  size="sm"
                  class="h-6 px-2 text-[10px]"
                  onclick={() => toggleFilter(col.name, val)}
                >
                  {#if col.name === "status"}
                    <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full {statusColors[val] ?? 'bg-gray-400'}"></span>
                  {/if}
                  {val}
                </Button>
              {/each}
            </div>
          </div>
        {/each}

        <!-- Range sliders for numeric columns -->
        {#each numericColumns as col (col.name)}
          {@const colMin = col.min ?? 0}
          {@const colMax = col.max ?? 100}
          {@const currentRange = rangeFilters[col.name]}
          {@const lo = currentRange?.[0] ?? colMin}
          {@const hi = currentRange?.[1] ?? colMax}
          {@const isActive = currentRange != null}
          {@const loPercent = ((lo - colMin) / (colMax - colMin)) * 100}
          {@const hiPercent = ((hi - colMin) / (colMax - colMin)) * 100}
          <div class="mb-3">
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{col.name.replace("_", " ")}</span>
              <span class="text-[9px] tabular-nums text-muted-foreground">
                {#if isActive}
                  {lo}–{hi}
                  <button class="ml-1 hover:text-foreground" onclick={() => { const { [col.name]: _, ...rest } = rangeFilters; rangeFilters = rest; currentPage = 0; }}>
                    <X class="inline h-2.5 w-2.5" />
                  </button>
                {:else}
                  {colMin}–{colMax}
                {/if}
              </span>
            </div>
            <!-- Dual-thumb range slider -->
            <div class="relative h-4">
              <!-- Track background -->
              <div class="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-muted"></div>
              <!-- Active range highlight -->
              <div
                class="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-primary/30"
                style="left: {loPercent}%; width: {hiPercent - loPercent}%"
              ></div>
              <!-- Min thumb -->
              <input
                type="range"
                min={colMin}
                max={colMax}
                value={lo}
                class="pointer-events-none absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background"
                oninput={(e) => {
                  const v = Math.min(Number(e.currentTarget.value), hi);
                  rangeFilters = { ...rangeFilters, [col.name]: [v, hi] };
                  currentPage = 0;
                }}
              />
              <!-- Max thumb -->
              <input
                type="range"
                min={colMin}
                max={colMax}
                value={hi}
                class="pointer-events-none absolute inset-0 m-0 h-full w-full cursor-pointer appearance-none bg-transparent [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:bg-background"
                oninput={(e) => {
                  const v = Math.max(Number(e.currentTarget.value), lo);
                  rangeFilters = { ...rangeFilters, [col.name]: [lo, v] };
                  currentPage = 0;
                }}
              />
            </div>
          </div>
        {/each}

        {#if filterCount > 0}
          <Button variant="ghost" size="sm" class="w-full text-xs" onclick={clearFilters}>
            <X class="mr-1 h-3 w-3" />
            Clear {filterCount} filter{filterCount !== 1 ? 's' : ''}
          </Button>
        {/if}
      </div>
    {/if}

    <Separator />

    <!-- Embeddings section (collapsible / pop-out) -->
    <div class="flex items-center px-3 pt-2">
      <button
        class="flex flex-1 items-center gap-1.5 rounded-md px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
        onclick={() => (showScatter = !showScatter)}
      >
        <ScatterChart class="h-3 w-3" />
        Embeddings
        {#if scatterSelection.size > 0}
          <Badge variant="secondary" class="h-4 px-1 text-[10px]">{scatterSelection.size}</Badge>
        {/if}
        <ChevronDown class="ml-auto h-3 w-3 transition-transform {showScatter ? '' : '-rotate-90'}" />
      </button>
      <button
        class="rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        onclick={popOutEmbeddings}
        title="Pop out into floating window"
      >
        <ExternalLink class="h-3 w-3" />
      </button>
    </div>
    {#if showScatter}
      <div class="px-3 pb-2">
        <div class="flex items-center gap-0.5 pb-1">
          {#each ["doc_type", "status", "label"] as opt (opt)}
            <button
              class="rounded px-1 py-0.5 text-[9px] {colorBy === opt ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}"
              onclick={() => (colorBy = opt as typeof colorBy)}
            >{opt.replace("_", " ")}</button>
          {/each}
          {#if scatterSelection.size > 0}
            <button class="ml-auto text-muted-foreground hover:text-foreground" onclick={() => { scatterSelection = new Set(); currentPage = 0; }}>
              <X class="h-3 w-3" />
            </button>
          {/if}
        </div>
        <div class="aspect-square w-full">
          <ScatterPlot
            points={allPages}
            selectedIds={scatterSelection}
            {filteredIds}
            onselect={handleScatterSelect}
            {colorBy}
          />
        </div>
      </div>
    {/if}

    <Separator />

    <!-- Statistics section (collapsible) -->
    <div class="px-3 pt-2">
      <button
        class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
        onclick={() => (showStats = !showStats)}
      >
        <BarChart3 class="h-3 w-3" />
        Statistics
        <Badge variant="secondary" class="h-4 px-1 text-[10px]">{filteredPages.length}</Badge>
        <ChevronDown class="ml-auto h-3 w-3 transition-transform {showStats ? '' : '-rotate-90'}" />
      </button>
    </div>
    {#if showStats}
      <div class="px-3 pb-2">
        <!-- Annotation count histogram -->
        <span class="mb-1 mt-1.5 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">Annotations per page</span>
        <div class="flex flex-col gap-0.5">
          {#each annotationHistogram as bucket (bucket.label)}
            {@const maxCount = Math.max(...annotationHistogram.map((b) => b.count), 1)}
            <div class="flex items-center gap-1.5">
              <span class="w-8 text-right text-[9px] text-muted-foreground">{bucket.label}</span>
              <div class="relative h-3.5 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  class="absolute inset-y-0 left-0 rounded-sm bg-primary/20"
                  style="width: {(bucket.count / maxCount) * 100}%"
                ></div>
              </div>
              <span class="w-5 text-right text-[9px] tabular-nums text-muted-foreground">{bucket.count}</span>
            </div>
          {/each}
        </div>

        <!-- Status breakdown -->
        <span class="mb-1 mt-3 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">By status</span>
        <div class="flex flex-col gap-0.5">
          {#each statusBreakdown as item (item.label)}
            {@const maxCount = Math.max(statusBreakdown[0]?.count ?? 1, 1)}
            <div class="flex items-center gap-1.5">
              <span class="flex w-16 items-center gap-1 text-[9px] text-muted-foreground">
                <span class="inline-block h-1.5 w-1.5 rounded-full {statusColors[item.label] ?? 'bg-gray-400'}"></span>
                {item.label}
              </span>
              <div class="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  class="absolute inset-y-0 left-0 rounded-sm bg-primary/20"
                  style="width: {(item.count / maxCount) * 100}%"
                ></div>
              </div>
              <span class="w-5 text-right text-[9px] tabular-nums text-muted-foreground">{item.count}</span>
            </div>
          {/each}
        </div>

        <!-- Label breakdown -->
        <span class="mb-1 mt-3 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">By label</span>
        <div class="flex flex-col gap-0.5">
          {#each labelBreakdown as item (item.label)}
            {@const maxCount = Math.max(labelBreakdown[0]?.count ?? 1, 1)}
            <div class="flex items-center gap-1.5">
              <span class="w-20 truncate text-[9px] text-muted-foreground">{item.label}</span>
              <div class="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  class="absolute inset-y-0 left-0 rounded-sm bg-primary/20"
                  style="width: {(item.count / maxCount) * 100}%"
                ></div>
              </div>
              <span class="w-5 text-right text-[9px] tabular-nums text-muted-foreground">{item.count}</span>
            </div>
          {/each}
        </div>

        <!-- Doc type breakdown -->
        <span class="mb-1 mt-3 block text-[9px] font-medium uppercase tracking-wider text-muted-foreground">By doc type</span>
        <div class="flex flex-col gap-0.5">
          {#each docTypeBreakdown as item (item.label)}
            {@const maxCount = Math.max(docTypeBreakdown[0]?.count ?? 1, 1)}
            <div class="flex items-center gap-1.5">
              <span class="w-20 truncate text-[9px] text-muted-foreground">{item.label}</span>
              <div class="relative h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                <div
                  class="absolute inset-y-0 left-0 rounded-sm bg-primary/20"
                  style="width: {(item.count / maxCount) * 100}%"
                ></div>
              </div>
              <span class="w-5 text-right text-[9px] tabular-nums text-muted-foreground">{item.count}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <Separator />
  </div>
  </Resizable.Pane>

  <Resizable.Handle />

  <Resizable.Pane defaultSize={showScatter ? 75 : 85} minSize={40}>
  <!-- Center: content area -->
  <div class="flex h-full min-w-0 flex-col">
    <!-- Compact top bar -->
    <div class="flex items-center gap-2 border-b px-4 py-1.5">
      {#if bulkMode}
        <!-- Select all checkbox (only in bulk mode) -->
        <button
          class="flex h-4 w-4 items-center justify-center rounded border {allCheckedOnPage ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30 hover:border-muted-foreground/60'}"
          onclick={toggleAllOnPage}
          title="Select all on this page"
        >
          {#if allCheckedOnPage}
            <Check class="h-3 w-3" />
          {/if}
        </button>
      {/if}

      <span class="text-sm font-medium">{total} pages</span>

      {#if scatterSelection.size > 0}
        <Badge variant="secondary" class="text-[10px]">{scatterSelection.size} in lasso</Badge>
        <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" onclick={() => { scatterSelection = new Set(); currentPage = 0; }}>
          <X class="mr-0.5 h-3 w-3" /> Clear
        </Button>
      {/if}

      {#if bulkMode && checkedCount > 0}
        <Separator orientation="vertical" class="h-4" />
        <Badge variant="default" class="text-[10px]">{checkedCount} selected</Badge>
        <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" onclick={() => { checkedIds = new Set(); }}>
          <X class="mr-0.5 h-3 w-3" /> Deselect
        </Button>
      {/if}

      <Tooltip.Provider delayDuration={300}>
      <div class="ml-auto flex items-center gap-1">
        <!-- Bulk label mode toggle -->
        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant={bulkMode ? "default" : "ghost"}
                size="sm"
                class="h-7 gap-1 px-2 text-xs"
                onclick={toggleBulkMode}
              >
                <Pencil class="h-3.5 w-3.5" />
                {#if bulkMode}
                  <AnimatedGradientText colorFrom="#f59e0b" colorTo="#a855f7" speed={1.5} class="text-xs font-medium">
                    Bulk Labeling
                  </AnimatedGradientText>
                {/if}
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>{bulkMode ? "Exit bulk label mode" : "Select pages and apply labels in bulk"}</Tooltip.Content>
        </Tooltip.Root>

        <Separator orientation="vertical" class="h-4" />

        {#if viewMode === "grid"}
          <!-- Grid size controls -->
          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-7 w-7 p-0" disabled={gridSize >= 5} onclick={() => (gridSize = Math.min(5, gridSize + 1))}>
                  <Minus class="h-3.5 w-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Smaller thumbnails</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-7 w-7 p-0" disabled={gridSize <= 1} onclick={() => (gridSize = Math.max(1, gridSize - 1))}>
                  <Plus class="h-3.5 w-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>Larger thumbnails</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-7 w-7 p-0 {showCardLabels ? '' : 'text-muted-foreground/40'}" onclick={() => (showCardLabels = !showCardLabels)}>
                  <Type class="h-3.5 w-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{showCardLabels ? "Hide card text" : "Show card text"}</Tooltip.Content>
          </Tooltip.Root>

          <Tooltip.Root>
            <Tooltip.Trigger>
              {#snippet child({ props })}
                <Button {...props} variant="ghost" size="sm" class="h-7 w-7 p-0 {showCardBadges ? '' : 'text-muted-foreground/40'}" onclick={() => (showCardBadges = !showCardBadges)}>
                  <Hash class="h-3.5 w-3.5" />
                </Button>
              {/snippet}
            </Tooltip.Trigger>
            <Tooltip.Content>{showCardBadges ? "Hide annotation counts & status" : "Show annotation counts & status"}</Tooltip.Content>
          </Tooltip.Root>

          <Separator orientation="vertical" class="h-4" />
        {/if}

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant={viewMode === "grid" ? "default" : "ghost"} size="sm" class="h-7 w-7 p-0" onclick={() => (viewMode = "grid")}>
                <Grid2x2 class="h-4 w-4" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Grid view</Tooltip.Content>
        </Tooltip.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button {...props} variant={viewMode === "table" ? "default" : "ghost"} size="sm" class="h-7 w-7 p-0" onclick={() => (viewMode = "table")}>
                <List class="h-4 w-4" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Table view</Tooltip.Content>
        </Tooltip.Root>
      </div>
      </Tooltip.Provider>
    </div>

  <!-- Content -->
  <div class="flex-1 overflow-y-auto">
    {#if loading}
      <div class="grid grid-cols-2 gap-4 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {#each Array(12) as _, i (i)}
          <div class="aspect-[3/4] animate-pulse rounded-lg bg-muted"></div>
        {/each}
      </div>
    {:else if pages.length === 0}
      <div class="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Search class="mb-4 h-12 w-12" />
        <p class="text-sm">No pages match your filters</p>
        {#if filterCount > 0}
          <Button variant="outline" size="sm" class="mt-3" onclick={clearFilters}>Clear filters</Button>
        {/if}
      </div>
    {:else if viewMode === "grid"}
      <!-- Grid view -->
      <div class="grid gap-1.5 p-2 {gridColsClass}">
        {#each pages as item (item.page_id)}
          {@const isChecked = bulkMode && checkedIds.has(item.page_id)}
          <div class="group relative">
            {#if bulkMode}
              <button
                class="absolute left-1 top-1 z-10 flex h-4 w-4 items-center justify-center rounded border bg-background/80 backdrop-blur-sm {isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}"
                onclick={(e) => { e.preventDefault(); toggleChecked(item.page_id); }}
              >
                {#if isChecked}
                  <Check class="h-2.5 w-2.5" />
                {/if}
              </button>
            {/if}
            <a href={bulkMode ? undefined : `/datasets/${datasetId}/${item.doc_id}/${item.page_num}`} class="block" onclick={bulkMode ? (e) => { e.preventDefault(); toggleChecked(item.page_id); } : undefined}>
              <div class="overflow-hidden rounded-sm border transition-shadow hover:shadow-md {isChecked ? 'ring-2 ring-primary' : ''}">
                <div class="relative aspect-[3/4] bg-muted">
                  <img
                    src="/api/thumbnails/{datasetId}/{item.page_id}"
                    alt="Page {item.page_num}"
                    class="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {#if showCardBadges}
                    <div class="absolute right-0.5 top-0.5">
                      <Badge variant="secondary" class="h-4 px-1 text-[8px]">{item.annotation_count}</Badge>
                    </div>
                    <div class="absolute bottom-0.5 left-0.5">
                      <span class="inline-block h-1.5 w-1.5 rounded-full {statusColors[item.status] ?? 'bg-gray-400'}"></span>
                    </div>
                  {/if}
                </div>
                {#if showCardLabels}
                  <div class="px-1 py-0.5">
                    <p class="truncate text-[9px] font-medium">{item.doc_id} / p.{item.page_num}</p>
                    <p class="truncate text-[8px] text-muted-foreground">{item.label} · {item.doc_type}</p>
                  </div>
                {/if}
              </div>
            </a>
          </div>
        {/each}
      </div>
    {:else}
      <!-- Table view -->
      <div class="p-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              {#if bulkMode}
                <th class="w-8 px-2 py-1.5">
                  <button
                    class="flex h-4 w-4 items-center justify-center rounded border {allCheckedOnPage ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}"
                    onclick={toggleAllOnPage}
                  >
                    {#if allCheckedOnPage}
                      <Check class="h-3 w-3" />
                    {/if}
                  </button>
                </th>
              {/if}
              {#each columns.filter((c) => c.name !== "umap_x" && c.name !== "umap_y") as col (col.name)}
                <th class="px-2 py-1.5">
                  <button
                    class="inline-flex items-center gap-1 hover:text-foreground"
                    onclick={() => toggleSort(col.name)}
                  >
                    {col.name}
                    {#if sortColumn === col.name}
                      <ArrowUpDown class="h-3 w-3 text-foreground" />
                    {/if}
                  </button>
                </th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each pages as item (item.page_id)}
              {@const isChecked = bulkMode && checkedIds.has(item.page_id)}
              <tr class="border-b hover:bg-muted/50 {isChecked ? 'bg-primary/5' : ''}" onclick={bulkMode ? () => toggleChecked(item.page_id) : undefined}>
                {#if bulkMode}
                  <td class="px-2 py-1.5">
                    <button
                      class="flex h-4 w-4 items-center justify-center rounded border {isChecked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/30'}"
                      onclick={() => toggleChecked(item.page_id)}
                    >
                      {#if isChecked}
                        <Check class="h-3 w-3" />
                      {/if}
                    </button>
                  </td>
                {/if}
                {#each columns.filter((c) => c.name !== "umap_x" && c.name !== "umap_y") as col (col.name)}
                  <td class="px-2 py-1.5">
                    {#if col.name === "page_id"}
                      <a href="/datasets/{datasetId}/{item.doc_id}/{item.page_num}" class="text-blue-600 hover:underline">
                        {item[col.name]}
                      </a>
                    {:else if col.name === "status"}
                      <Badge variant="outline" class="text-[10px] {statusColors[String(item.status)]?.replace('bg-', 'text-') ?? ''}">
                        {item[col.name]}
                      </Badge>
                    {:else}
                      {item[col.name]}
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </div>

  <!-- Pagination -->
  {#if totalPages > 1}
    <div class="flex items-center justify-between border-t px-4 py-2">
      <span class="text-xs text-muted-foreground">
        Showing {currentPage * pageSize + 1}–{Math.min((currentPage + 1) * pageSize, total)} of {total}
      </span>
      <div class="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          class="h-7 w-7 p-0"
          disabled={currentPage === 0}
          onclick={() => (currentPage = Math.max(0, currentPage - 1))}
        >
          <ChevronLeft class="h-4 w-4" />
        </Button>
        <span class="px-2 text-xs">Page {currentPage + 1} of {totalPages}</span>
        <Button
          variant="outline"
          size="sm"
          class="h-7 w-7 p-0"
          disabled={currentPage >= totalPages - 1}
          onclick={() => (currentPage = Math.min(totalPages - 1, currentPage + 1))}
        >
          <ChevronRight class="h-4 w-4" />
        </Button>
      </div>
    </div>
  {/if}
  </div>
  </Resizable.Pane>

  <!-- Bulk label right panel — shows when in bulk mode with items checked -->
  {#if bulkMode && checkedCount > 0}
    <Resizable.Handle />
    <Resizable.Pane defaultSize={22} minSize={15} maxSize={40}>
    <div class="flex h-full flex-col bg-background">
      <div class="flex items-center gap-2 border-b px-3 py-2">
        <Tags class="h-4 w-4 text-primary" />
        <span class="text-sm font-medium">Bulk Label</span>
        <Badge variant="secondary" class="text-[10px]">{checkedCount} pages</Badge>
        <button class="ml-auto text-muted-foreground hover:text-foreground" onclick={clearChecked}>
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        <p class="mb-3 text-xs text-muted-foreground">
          Set values to apply to all {checkedCount} selected pages. Unchanged fields keep their current value.
        </p>

        <!-- Text field (textarea) -->
        <div class="mb-4">
          <label class="mb-1.5 block text-xs font-medium">Text</label>
          <textarea
            class="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
            rows={3}
            placeholder="Leave empty to keep current text..."
            value={bulkForm["text"] ?? ""}
            oninput={(e) => { bulkForm = { ...bulkForm, text: e.currentTarget.value }; }}
          ></textarea>
        </div>

        <Separator class="mb-4" />

        <!-- Enum fields -->
        {#each enumColumns as col (col.name)}
          <div class="mb-4">
            <label class="mb-1.5 block text-xs font-medium capitalize">{col.name.replace("_", " ")}</label>
            <div class="flex flex-wrap gap-1">
              <button
                class="rounded-md border px-2 py-1 text-xs {!bulkForm[col.name] ? 'border-muted-foreground/20 bg-muted/50 text-muted-foreground' : 'border-border text-muted-foreground hover:bg-accent'}"
                onclick={() => { bulkForm = { ...bulkForm, [col.name]: "" }; }}
              >
                — unchanged
              </button>
              {#each col.values ?? [] as val (val)}
                {@const isSelected = bulkForm[col.name] === val}
                <button
                  class="rounded-md border px-2 py-1 text-xs {isSelected ? 'border-primary bg-primary text-primary-foreground' : 'border-border hover:bg-accent'}"
                  onclick={() => { bulkForm = { ...bulkForm, [col.name]: val }; }}
                >
                  {#if col.name === "status"}
                    <span class="mr-1 inline-block h-1.5 w-1.5 rounded-full {statusColors[val] ?? 'bg-gray-400'}"></span>
                  {/if}
                  {val}
                </button>
              {/each}
            </div>
            <!-- Custom value input -->
            <div class="mt-1.5 flex items-center gap-1">
              <input
                type="text"
                class="h-6 flex-1 rounded border border-border bg-background px-1.5 text-[10px] placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                placeholder="Or type a new value..."
                value={bulkForm[col.name] && !(col.values ?? []).includes(bulkForm[col.name]) ? bulkForm[col.name] : ""}
                oninput={(e) => {
                  const v = e.currentTarget.value;
                  if (v) {
                    bulkForm = { ...bulkForm, [col.name]: v };
                  }
                }}
              />
            </div>
          </div>
        {/each}

        <Separator class="mb-4" />

        <!-- Add custom column -->
        <div class="mb-2">
          <span class="mb-1.5 block text-xs font-medium">Custom field</span>
          <p class="mb-1.5 text-[10px] text-muted-foreground">Add a value for a column not listed above.</p>
          <div class="flex items-center gap-1">
            <input
              type="text"
              class="h-7 w-24 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              placeholder="Column name"
              bind:value={customFieldName}
            />
            <input
              type="text"
              class="h-7 flex-1 rounded border border-border bg-background px-2 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              placeholder="Value"
              bind:value={customFieldValue}
            />
            <Button
              variant="outline"
              size="sm"
              class="h-7 px-2 text-xs"
              disabled={!customFieldName || !customFieldValue}
              onclick={() => {
                bulkForm = { ...bulkForm, [customFieldName]: customFieldValue };
                customFieldName = "";
                customFieldValue = "";
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <!-- Show custom fields that were added -->
        {#each Object.entries(bulkForm).filter(([k, v]) => v && !enumColumns.some((c) => c.name === k) && k !== "text") as [key, val] (key)}
          <div class="mt-1 flex items-center gap-1 rounded border border-primary/20 bg-primary/5 px-2 py-1 text-xs">
            <span class="font-medium">{key}</span>
            <span class="text-muted-foreground">=</span>
            <span class="flex-1 truncate">{val}</span>
            <button class="text-muted-foreground hover:text-foreground" onclick={() => { const { [key]: _, ...rest } = bulkForm; bulkForm = rest; }}>
              <X class="h-3 w-3" />
            </button>
          </div>
        {/each}
      </div>

      <div class="border-t p-3">
        <p class="mb-2 text-[10px] text-muted-foreground">
          This will overwrite the selected fields on {checkedCount} page{checkedCount !== 1 ? 's' : ''}. Unchanged fields will not be affected.
        </p>
        <Button
          variant="default"
          size="sm"
          class="w-full gap-1"
          disabled={bulkSubmitting || Object.values(bulkForm).every((v) => !v)}
          onclick={submitBulkLabel}
        >
          {#if bulkSubmitting}
            Applying...
          {:else}
            <Check class="h-3 w-3" />
            Apply to {checkedCount} page{checkedCount !== 1 ? 's' : ''}
          {/if}
        </Button>
        <Button variant="ghost" size="sm" class="mt-1 w-full text-xs" onclick={clearChecked}>
          Cancel
        </Button>
      </div>
    </div>
    </Resizable.Pane>
  {/if}
</Resizable.PaneGroup>

<!-- Floating pop-out embeddings window -->
{#if embeddingsPopped}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed z-50 flex flex-col rounded-lg border bg-background shadow-2xl"
    style="left: {popX}px; top: {popY}px; width: {popW}px; height: {popH}px;"
    onmousemove={handleWindowMouseMove}
    onmouseup={handleWindowMouseUp}
    onmouseleave={handleWindowMouseUp}
  >
    <!-- Title bar (draggable) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="flex cursor-move items-center gap-2 border-b bg-muted/50 px-3 py-1.5"
      onmousedown={startDrag}
    >
      <ScatterChart class="h-3.5 w-3.5 text-muted-foreground" />
      <span class="text-xs font-medium">Embeddings</span>
      {#if scatterSelection.size > 0}
        <Badge variant="secondary" class="h-4 px-1 text-[10px]">{scatterSelection.size}</Badge>
      {/if}
      <div class="ml-auto flex items-center gap-1">
        <div class="flex items-center gap-0.5">
          {#each ["doc_type", "status", "label"] as opt (opt)}
            <button
              class="rounded px-1 py-0.5 text-[9px] {colorBy === opt ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}"
              onclick={() => (colorBy = opt as typeof colorBy)}
            >{opt.replace("_", " ")}</button>
          {/each}
        </div>
        {#if scatterSelection.size > 0}
          <button class="rounded border border-border px-1.5 py-0.5 text-[9px] text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => { scatterSelection = new Set(); currentPage = 0; }}>
            Clear
          </button>
        {/if}
        <Separator orientation="vertical" class="h-3" />
        <button class="rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onclick={dockEmbeddings} title="Close and dock back to sidebar">
          <X class="h-3.5 w-3.5" />
        </button>
      </div>
    </div>

    <!-- Scatter plot content — min-h-0 + overflow-hidden so flex-1 shrinks and bind:clientWidth/Height updates -->
    <div class="min-h-0 flex-1 overflow-hidden">
      <ScatterPlot
        points={allPages}
        selectedIds={scatterSelection}
        {filteredIds}
        onselect={handleScatterSelect}
        {colorBy}
      />
    </div>

    <!-- Resize handle (bottom-right corner, more visible) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="absolute bottom-0 right-0 h-5 w-5 cursor-se-resize"
      onmousedown={startResize}
    >
      <svg class="h-5 w-5 text-muted-foreground/30" viewBox="0 0 20 20">
        <line x1="18" y1="8" x2="8" y2="18" stroke="currentColor" stroke-width="1.5" />
        <line x1="18" y1="13" x2="13" y2="18" stroke="currentColor" stroke-width="1.5" />
        <line x1="18" y1="18" x2="18" y2="18" stroke="currentColor" stroke-width="1.5" />
      </svg>
    </div>
  </div>
{/if}
