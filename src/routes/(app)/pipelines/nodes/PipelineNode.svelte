<script lang="ts" module>
  import type { Node, NodeProps } from "@xyflow/svelte";
  import type { Component } from "svelte";

  export type PipelineNodeData = {
    label: string;
    description?: string;
    icon?: Component;
    category: "data" | "labeling" | "sampling" | "evaluation" | "ml" | "output";
    status?: "active" | "idle" | "error" | "running";
    config?: Record<string, unknown>;
  };

  export type PipelineNodeType = Node<PipelineNodeData>;
</script>

<script lang="ts">
  import { Handle, Position } from "@xyflow/svelte";

  let { data, selected }: NodeProps<PipelineNodeType> = $props();

  const categoryColors: Record<string, { bg: string; border: string; icon: string }> = {
    data: { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-300 dark:border-blue-700", icon: "text-blue-500" },
    labeling: { bg: "bg-amber-50 dark:bg-amber-950/30", border: "border-amber-300 dark:border-amber-700", icon: "text-amber-500" },
    sampling: { bg: "bg-green-50 dark:bg-green-950/30", border: "border-green-300 dark:border-green-700", icon: "text-green-500" },
    evaluation: { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-300 dark:border-purple-700", icon: "text-purple-500" },
    ml: { bg: "bg-rose-50 dark:bg-rose-950/30", border: "border-rose-300 dark:border-rose-700", icon: "text-rose-500" },
    output: { bg: "bg-cyan-50 dark:bg-cyan-950/30", border: "border-cyan-300 dark:border-cyan-700", icon: "text-cyan-500" },
  };

  const statusIndicator: Record<string, string> = {
    active: "bg-green-500",
    idle: "bg-gray-400",
    error: "bg-red-500",
    running: "bg-amber-500 animate-pulse",
  };

  const colors = $derived(categoryColors[data.category] ?? categoryColors.data);
  const statusColor = $derived(statusIndicator[data.status ?? "idle"]);
</script>

<div
  class="min-w-[180px] rounded-lg border-2 px-3 py-2 shadow-sm transition-shadow {colors.bg} {selected ? 'border-primary shadow-md' : colors.border}"
>
  <Handle type="target" position={Position.Left} class="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground" />

  <div class="flex items-start gap-2">
    {#if data.icon}
      <div class="mt-0.5 {colors.icon}">
        <data.icon class="h-4 w-4" />
      </div>
    {/if}
    <div class="flex-1">
      <div class="flex items-center gap-1.5">
        <span class="text-xs font-semibold">{data.label}</span>
        <span class="h-2 w-2 rounded-full {statusColor}"></span>
      </div>
      {#if data.description}
        <p class="mt-0.5 text-[10px] leading-tight text-muted-foreground">{data.description}</p>
      {/if}
    </div>
  </div>

  <Handle type="source" position={Position.Right} class="!h-3 !w-3 !border-2 !border-background !bg-muted-foreground" />
</div>
