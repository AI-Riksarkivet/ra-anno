<script lang="ts">
  import { page } from "$app/state";
  import ScatterPlot from "$lib/components/ScatterPlot.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Filter from "@lucide/svelte/icons/filter";
  import Grid2x2 from "@lucide/svelte/icons/grid-2x2";
  import List from "@lucide/svelte/icons/list";
  import Search from "@lucide/svelte/icons/search";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import ScatterChart from "@lucide/svelte/icons/scatter-chart";
  import X from "@lucide/svelte/icons/x";

  interface ColumnDef {
    name: string;
    type: string;
    values?: readonly string[];
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
  let showScatter = $state(true);
  let showStats = $state(false);
  let scatterSelection = $state<Set<string>>(new Set());
  let colorBy = $state<"status" | "label" | "doc_type">("doc_type");

  // View mode
  let viewMode = $state<"grid" | "table">("grid");

  // Search
  let searchQuery = $state("");
  let searchDebounced = $state("");
  let searchTimer: ReturnType<typeof setTimeout>;

  // Filters — multi-select per enum column
  let activeFilters = $state<Record<string, string[]>>({});

  // Sort
  let sortColumn = $state("page_num");
  let sortOrder = $state<"asc" | "desc">("asc");

  // Pagination
  let currentPage = $state(0);
  const pageSize = 48;
  const totalPages = $derived(Math.ceil(total / pageSize));

  // Enum columns for filter dropdowns
  const enumColumns = $derived(columns.filter((c) => c.type === "enum"));

  // Total number of active filter values
  const filterCount = $derived(
    Object.values(activeFilters).reduce((sum, arr) => sum + arr.length, 0),
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
        {#if filterCount > 0}
          <Button variant="ghost" size="sm" class="w-full text-xs" onclick={clearFilters}>
            <X class="mr-1 h-3 w-3" />
            Clear {filterCount} filter{filterCount !== 1 ? 's' : ''}
          </Button>
        {/if}
      </div>
    {/if}

    <Separator />

    <!-- Embeddings section (collapsible) -->
    <div class="px-3 pt-2">
      <button
        class="flex w-full items-center gap-1.5 rounded-md px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
        onclick={() => (showScatter = !showScatter)}
      >
        <ScatterChart class="h-3 w-3" />
        Embeddings
        {#if scatterSelection.size > 0}
          <Badge variant="secondary" class="h-4 px-1 text-[10px]">{scatterSelection.size}</Badge>
        {/if}
        <ChevronDown class="ml-auto h-3 w-3 transition-transform {showScatter ? '' : '-rotate-90'}" />
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
    <div class="flex items-center gap-3 border-b px-4 py-1.5">
      <span class="text-sm font-medium">{total} pages</span>

      {#if scatterSelection.size > 0}
        <Badge variant="secondary" class="text-[10px]">{scatterSelection.size} selected</Badge>
        <Button variant="ghost" size="sm" class="h-5 px-1.5 text-[10px]" onclick={() => { scatterSelection = new Set(); currentPage = 0; }}>
          <X class="mr-0.5 h-3 w-3" /> Clear
        </Button>
      {/if}

      <div class="ml-auto flex items-center gap-1">
        <Button
          variant={viewMode === "grid" ? "default" : "ghost"}
          size="sm"
          class="h-7 w-7 p-0"
          onclick={() => (viewMode = "grid")}
        >
          <Grid2x2 class="h-4 w-4" />
        </Button>
        <Button
          variant={viewMode === "table" ? "default" : "ghost"}
          size="sm"
          class="h-7 w-7 p-0"
          onclick={() => (viewMode = "table")}
        >
          <List class="h-4 w-4" />
        </Button>
      </div>
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
      <div class="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
        {#each pages as item (item.page_id)}
          <a href="/datasets/{datasetId}/{item.doc_id}/{item.page_num}" class="group block">
            <Card.Root class="overflow-hidden transition-shadow hover:shadow-md">
              <div class="relative aspect-[3/4] bg-muted">
                <img
                  src="/api/thumbnails/{datasetId}/{item.page_id}"
                  alt="Page {item.page_num}"
                  class="h-full w-full object-cover"
                  loading="lazy"
                />
                <div class="absolute right-1 top-1">
                  <Badge variant="secondary" class="text-[10px]">{item.annotation_count}</Badge>
                </div>
                <div class="absolute left-1 top-1">
                  <span class="inline-block h-2 w-2 rounded-full {statusColors[item.status] ?? 'bg-gray-400'}"></span>
                </div>
              </div>
              <Card.Content class="p-1.5">
                <p class="truncate text-[10px] font-medium">{item.doc_id} / p.{item.page_num}</p>
                <p class="truncate text-[9px] text-muted-foreground">{item.label} · {item.doc_type}</p>
              </Card.Content>
            </Card.Root>
          </a>
        {/each}
      </div>
    {:else}
      <!-- Table view -->
      <div class="p-4">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b text-left text-xs text-muted-foreground">
              {#each columns.filter((c) => c.name !== "width" && c.name !== "height" && c.name !== "umap_x" && c.name !== "umap_y") as col (col.name)}
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
              <tr class="border-b hover:bg-muted/50">
                {#each columns.filter((c) => c.name !== "width" && c.name !== "height" && c.name !== "umap_x" && c.name !== "umap_y") as col (col.name)}
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
</Resizable.PaneGroup>
