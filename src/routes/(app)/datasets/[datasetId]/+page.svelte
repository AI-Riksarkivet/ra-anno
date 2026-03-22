<script lang="ts">
  import { page } from "$app/state";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import Grid2x2 from "@lucide/svelte/icons/grid-2x2";
  import List from "@lucide/svelte/icons/list";
  import Search from "@lucide/svelte/icons/search";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
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
    [key: string]: unknown;
  }

  const datasetId = $derived(page.params.datasetId);

  let pages = $state<PageItem[]>([]);
  let columns = $state<ColumnDef[]>([]);
  let total = $state(0);
  let loading = $state(true);

  // View mode
  let viewMode = $state<"grid" | "table">("grid");

  // Search
  let searchQuery = $state("");
  let searchDebounced = $state("");
  let searchTimer: ReturnType<typeof setTimeout>;

  // Filters — dynamic based on column schema
  let activeFilters = $state<Record<string, string>>({});

  // Sort
  let sortColumn = $state("page_num");
  let sortOrder = $state<"asc" | "desc">("asc");

  // Pagination
  let currentPage = $state(0);
  const pageSize = 48;
  const totalPages = $derived(Math.ceil(total / pageSize));

  // Enum columns for filter dropdowns
  const enumColumns = $derived(columns.filter((c) => c.type === "enum"));

  // Active filter count
  const filterCount = $derived(Object.keys(activeFilters).length);

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
    if (activeFilters[column] === value) {
      const next = { ...activeFilters };
      delete next[column];
      activeFilters = next;
    } else {
      activeFilters = { ...activeFilters, [column]: value };
    }
    currentPage = 0;
  }

  function clearFilters() {
    activeFilters = {};
    searchDebounced = "";
    searchQuery = "";
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

  $effect(() => {
    // Track reactive dependencies
    const _dataset = datasetId;
    const _search = searchDebounced;
    const _filters = activeFilters;
    const _sort = sortColumn;
    const _order = sortOrder;
    const _page = currentPage;

    loading = true;
    const params = new URLSearchParams();
    params.set("limit", String(pageSize));
    params.set("offset", String(_page * pageSize));
    params.set("sort", _sort);
    params.set("order", _order);
    if (_search) params.set("q", _search);
    for (const [key, val] of Object.entries(_filters)) {
      params.set(key, val);
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

<div class="flex h-[calc(100vh-3rem)] flex-col">
  <!-- Header bar -->
  <div class="flex items-center gap-3 border-b px-4 py-2">
    <Grid2x2 class="h-5 w-5 text-muted-foreground" />
    <h1 class="text-sm font-medium">{datasetId}</h1>
    <Separator orientation="vertical" class="h-5" />
    <span class="text-sm text-muted-foreground">{total} pages</span>

    <!-- Search -->
    <div class="relative ml-4 w-48">
      <Search class="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        class="h-7 pl-7 text-xs"
        placeholder="Search pages..."
        value={searchQuery}
        oninput={(e) => {
          searchQuery = e.currentTarget.value;
          debounceSearch(searchQuery);
        }}
      />
    </div>

    <!-- Dynamic enum filters -->
    {#each enumColumns as col (col.name)}
      <div class="flex items-center gap-0.5">
        <span class="text-xs text-muted-foreground">{col.name}:</span>
        {#each col.values ?? [] as val (val)}
          <Button
            variant={activeFilters[col.name] === val ? "default" : "outline"}
            size="sm"
            class="h-5 px-1.5 text-[10px]"
            onclick={() => toggleFilter(col.name, val)}
          >
            {#if col.name === "status"}
              <span class="mr-0.5 inline-block h-1.5 w-1.5 rounded-full {statusColors[val] ?? 'bg-gray-400'}"></span>
            {/if}
            {val}
          </Button>
        {/each}
      </div>
    {/each}

    {#if filterCount > 0 || searchDebounced}
      <Button variant="ghost" size="sm" class="h-6 px-2 text-xs" onclick={clearFilters}>
        <X class="mr-1 h-3 w-3" />
        Clear
      </Button>
    {/if}

    <!-- View toggle + sort -->
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
              {#each columns.filter((c) => c.name !== "width" && c.name !== "height") as col (col.name)}
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
                {#each columns.filter((c) => c.name !== "width" && c.name !== "height") as col (col.name)}
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
