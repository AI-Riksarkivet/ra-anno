<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import ChevronLeft from "@lucide/svelte/icons/chevron-left";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import LayoutGrid from "@lucide/svelte/icons/layout-grid";
  import List from "@lucide/svelte/icons/list";

  interface PageInfo {
    page_id: string;
    doc_id: string;
    page_num: number;
  }

  let {
    pages = [],
    currentPageNum = 1,
    datasetId = "",
    docId = "",
    onNavigate,
  }: {
    pages?: PageInfo[];
    currentPageNum?: number;
    datasetId?: string;
    docId?: string;
    onNavigate?: (pageNum: number) => void;
  } = $props();

  let showGallery = $state(false);

  const currentIndex = $derived(pages.findIndex((p) => p.page_num === currentPageNum));
  const hasPrev = $derived(currentIndex > 0);
  const hasNext = $derived(currentIndex < pages.length - 1);

  function goPrev() {
    if (hasPrev) onNavigate?.(pages[currentIndex - 1].page_num);
  }

  function goNext() {
    if (hasNext) onNavigate?.(pages[currentIndex + 1].page_num);
  }
</script>

<svelte:window
  onkeydown={(e) => {
    if (e.key === "ArrowLeft" && e.altKey) { e.preventDefault(); goPrev(); }
    if (e.key === "ArrowRight" && e.altKey) { e.preventDefault(); goNext(); }
  }}
/>

<div class="border-t bg-background">
  {#if showGallery}
    <!-- Gallery strip -->
    <div class="flex items-center gap-1 px-2 py-1">
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 shrink-0 p-0"
        title="Pagination view"
        onclick={() => (showGallery = false)}
      >
        <List class="h-3.5 w-3.5" />
      </Button>
      <div class="flex flex-1 gap-1 overflow-x-auto py-1">
        {#each pages as page (page.page_id)}
          <button
            class="relative h-16 w-12 shrink-0 overflow-hidden rounded border transition-colors hover:border-foreground"
            class:border-primary={page.page_num === currentPageNum}
            class:ring-1={page.page_num === currentPageNum}
            class:ring-primary={page.page_num === currentPageNum}
            onclick={() => onNavigate?.(page.page_num)}
            title="Page {page.page_num}"
          >
            <img
              src="/api/thumbnails/{datasetId}/{page.page_id}"
              alt="Page {page.page_num}"
              class="h-full w-full object-cover"
              loading="lazy"
            />
            <span class="absolute bottom-0 left-0 right-0 bg-background/80 text-center text-[9px] tabular-nums">
              {page.page_num}
            </span>
          </button>
        {/each}
      </div>
    </div>
  {:else}
    <!-- Pagination bar -->
    <div class="flex h-8 items-center justify-center gap-2 px-2">
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        title="Gallery view"
        onclick={() => (showGallery = true)}
      >
        <LayoutGrid class="h-3.5 w-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        disabled={!hasPrev}
        title="Previous page (Alt+Left)"
        onclick={goPrev}
      >
        <ChevronLeft class="h-4 w-4" />
      </Button>
      <span class="text-xs tabular-nums text-muted-foreground">
        Page {currentPageNum} of {pages.length}
      </span>
      <Button
        variant="ghost"
        size="sm"
        class="h-7 w-7 p-0"
        disabled={!hasNext}
        title="Next page (Alt+Right)"
        onclick={goNext}
      >
        <ChevronRight class="h-4 w-4" />
      </Button>
    </div>
  {/if}
</div>
