<script lang="ts">
  import { Button } from "$lib/components/ui/button/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Input } from "$lib/components/ui/input/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import type { Table } from "apache-arrow";
  import { statusColor } from "$lib/utils/color.js";
  import type { AnnotationStatus } from "$lib/types/schemas.js";

  let collapsed = $state(false);

  let {
    table = null,
    selectedIndex = null,
    onSelect,
    onUpdateStatus,
    onUpdateField,
    onDelete,
  }: {
    table?: Table | null;
    selectedIndex?: number | null;
    onSelect?: (index: number | null) => void;
    onUpdateStatus?: (index: number, status: AnnotationStatus) => void;
    onUpdateField?: (index: number, field: string, value: string) => void;
    onDelete?: (index: number) => void;
  } = $props();

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
</script>

<script module lang="ts">
  import PanelRightClose from "@lucide/svelte/icons/panel-right-close";
  import PanelRightOpen from "@lucide/svelte/icons/panel-right-open";
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

  {#if selected && selectedIndex !== null}
    <div class="border-b p-3">
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium">Annotation #{selectedIndex}</span>
        <button
          class="text-xs text-muted-foreground hover:text-foreground"
          onclick={() => onSelect?.(null)}
        >
          close
        </button>
      </div>
    </div>

    <div class="flex-1 space-y-3 overflow-y-auto p-3">
      <div>
        <span class="text-xs text-muted-foreground">Text</span>
        <Input
          value={String(selected.text || "")}
          placeholder="Transcription..."
          class="mt-1 h-8 text-sm"
          onchange={(e) => onUpdateField?.(selectedIndex, "text", e.currentTarget.value)}
        />
      </div>

      <div>
        <span class="text-xs text-muted-foreground">Label</span>
        <Input
          value={String(selected.label || "")}
          placeholder="Label..."
          class="mt-1 h-8 text-sm"
          onchange={(e) => onUpdateField?.(selectedIndex, "label", e.currentTarget.value)}
        />
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

      <Separator />

      <div class="flex flex-col gap-1.5">
        <Button
          variant="outline"
          size="sm"
          class="justify-start text-green-700"
          onclick={() => onUpdateStatus?.(selectedIndex, "accepted")}
        >
          Accept
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="justify-start text-red-700"
          onclick={() => onUpdateStatus?.(selectedIndex, "rejected")}
        >
          Reject
        </Button>
        <Button
          variant="outline"
          size="sm"
          class="justify-start"
          onclick={() => onUpdateStatus?.(selectedIndex, "draft")}
        >
          Reset to Draft
        </Button>
        <Separator />
        <Button
          variant="destructive"
          size="sm"
          onclick={() => onDelete?.(selectedIndex)}
        >
          Delete
        </Button>
      </div>
    </div>
  {:else}
    <div class="border-b p-3">
      <span class="text-sm font-medium">Annotations</span>
    </div>
    <div class="flex-1 overflow-y-auto">
      {#if table && table.numRows > 0}
        {#each Array.from({ length: table.numRows }) as _, i (table
          .getChild("id")
          ?.get(i) ?? i)}
          {@const status = String(table.getChild("status")?.get(i) ?? "draft")}
          {@const label = String(table.getChild("label")?.get(i) ?? "")}
          <button
            class="flex w-full items-center gap-2 border-b px-3 py-2 text-left text-sm hover:bg-accent"
            onclick={() => onSelect?.(i)}
          >
            <span
              class="h-2.5 w-2.5 rounded-full"
              style="background-color: #{statusColor(status)
                .toString(16)
                .padStart(6, '0')}"
            ></span>
            <span class="flex-1 truncate">{label || "unlabeled"}</span>
            <span class="text-xs text-muted-foreground">{status}</span>
          </button>
        {/each}
      {:else}
        <p class="p-3 text-sm text-muted-foreground">No annotations</p>
      {/if}
    </div>
  {/if}
</div>
{/if}
