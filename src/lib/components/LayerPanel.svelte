<script module lang="ts">
  import Eye from "@lucide/svelte/icons/eye";
  import EyeOff from "@lucide/svelte/icons/eye-off";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
</script>

<script lang="ts">
  import type { Table } from "apache-arrow";
  import { getContext } from "svelte";
  import { type LayerStore, LAYER_CTX } from "$lib/stores/layers.svelte.js";
  import {
    Select,
    SelectTrigger,
    SelectContent,
    SelectItem,
  } from "$lib/components/ui/select/index.js";
  import { colorToHex, hexToColor } from "$lib/utils/color.js";

  const KNOWN_STRING_COLUMNS = ["label", "status", "source", "group", "reviewer"];

  const ctxStore = getContext<LayerStore>(LAYER_CTX);

  let { table = null, store = ctxStore }: { table?: Table | null; store?: LayerStore } = $props();

  let collapsed = $state(false);

  const stringColumns = $derived.by(() => {
    if (!table) return [];
    return table.schema.fields
      .filter((f) => KNOWN_STRING_COLUMNS.includes(f.name))
      .map((f) => f.name);
  });

  const groups = $derived.by(() => {
    if (!table || table.numRows === 0) return [];
    const col = table.getChild(store.groupByColumn);
    if (!col) return [];
    const counts: Record<string, number> = {};
    for (let i = 0; i < table.numRows; i++) {
      const val = String(col.get(i) ?? "unknown");
      counts[val] = (counts[val] ?? 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
</script>

<div class="border-b">
  <button
    class="flex w-full items-center gap-1 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent"
    onclick={() => (collapsed = !collapsed)}
  >
    {#if collapsed}
      <ChevronRight class="h-3.5 w-3.5" />
    {:else}
      <ChevronDown class="h-3.5 w-3.5" />
    {/if}
    Layers
  </button>

  {#if !collapsed}
    <div class="px-3 pb-2">
      <div class="mb-2 flex items-center gap-2 text-xs">
        <span class="text-muted-foreground">Group by:</span>
        <Select
          type="single"
          value={store.groupByColumn}
          onValueChange={(v) => { if (v) store.setGroupBy(v); }}
        >
          <SelectTrigger size="sm">{store.groupByColumn}</SelectTrigger>
          <SelectContent>
            {#each stringColumns as col (col)}
              <SelectItem value={col}>{col}</SelectItem>
            {/each}
          </SelectContent>
        </Select>
      </div>

      {#if groups.length > 0}
        <div class="space-y-0.5">
          {#each groups as group (group.name)}
            {@const hidden = store.isHidden(group.name)}
            {@const rawColor = store.getColor(group.name)}
            {@const hex = rawColor !== undefined ? colorToHex(rawColor) : "#8b5cf6"}
            <div class="flex items-center gap-1.5 rounded px-1 py-0.5 text-sm hover:bg-accent">
              <button
                class="flex h-5 w-5 shrink-0 items-center justify-center rounded hover:bg-muted"
                onclick={() => store.toggleVisibility(group.name)}
                title={hidden ? "Show group" : "Hide group"}
              >
                {#if hidden}
                  <EyeOff class="h-3.5 w-3.5 text-muted-foreground" />
                {:else}
                  <Eye class="h-3.5 w-3.5" />
                {/if}
              </button>

              <input
                type="color"
                class="h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-full border-0 bg-transparent p-0"
                value={hex}
                onchange={(e) =>
                  store.setColor(group.name, hexToColor(e.currentTarget.value))}
                title="Change group color"
              />

              <span class="flex-1 truncate text-xs" class:text-muted-foreground={hidden}>
                {group.name}
              </span>
              <span class="shrink-0 text-xs text-muted-foreground">{group.count}</span>
            </div>
          {/each}
        </div>
      {:else}
        <p class="text-xs text-muted-foreground">No groups</p>
      {/if}
    </div>
  {/if}
</div>
