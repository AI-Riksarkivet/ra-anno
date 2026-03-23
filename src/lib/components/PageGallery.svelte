<script lang="ts">
  interface PageInfo {
    page_id: string;
    doc_id: string;
    page_num: number;
  }

  let {
    open = false,
    pages = [],
    currentPageNum = 1,
    datasetId = "",
    onNavigate,
  }: {
    open?: boolean;
    pages?: PageInfo[];
    currentPageNum?: number;
    datasetId?: string;
    onNavigate?: (pageNum: number) => void;
  } = $props();
</script>

{#if open}
  <div class="absolute inset-x-0 bottom-0 z-20 border-t bg-background/95 backdrop-blur-sm">
    <div class="flex items-center gap-1.5 px-2 py-1.5">
      <div class="flex flex-1 gap-1 overflow-x-auto py-0.5">
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
      <span class="shrink-0 text-xs tabular-nums text-muted-foreground">
        {currentPageNum}/{pages.length}
      </span>
    </div>
  </div>
{/if}
