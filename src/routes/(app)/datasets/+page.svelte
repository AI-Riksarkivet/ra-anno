<script lang="ts">
  import * as Card from "$lib/components/ui/card/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import Database from "@lucide/svelte/icons/database";
  import FileText from "@lucide/svelte/icons/file-text";

  interface Dataset {
    dataset_id: string;
    name: string;
    doc_type: string;
    page_count: number;
  }

  let datasets = $state<Dataset[]>([]);
  let loading = $state(true);

  $effect(() => {
    fetch("/api/datasets")
      .then((r) => r.json())
      .then((data) => {
        datasets = data;
        loading = false;
      });
  });
</script>

<div class="p-6">
  <div class="mb-6 flex items-center gap-3">
    <Database class="h-6 w-6 text-muted-foreground" />
    <h1 class="text-2xl font-semibold">Datasets</h1>
  </div>

  {#if loading}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each Array(3) as _, i (i)}
        <div class="h-32 animate-pulse rounded-lg bg-muted"></div>
      {/each}
    </div>
  {:else if datasets.length === 0}
    <div
      class="rounded-lg border border-dashed border-gray-300 p-12 text-center"
    >
      <FileText class="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
      <p class="text-muted-foreground">No datasets loaded yet.</p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {#each datasets as ds (ds.dataset_id)}
        <a href="/datasets/{ds.dataset_id}" class="block">
          <Card.Root
            class="transition-shadow hover:shadow-md"
          >
            <Card.Header>
              <Card.Title>{ds.name}</Card.Title>
              <Card.Description>{ds.dataset_id}</Card.Description>
            </Card.Header>
            <Card.Content>
              <div class="flex items-center gap-3">
                <Badge variant="secondary">{ds.doc_type}</Badge>
                <span class="text-sm text-muted-foreground">
                  {ds.page_count} pages
                </span>
              </div>
            </Card.Content>
          </Card.Root>
        </a>
      {/each}
    </div>
  {/if}
</div>
