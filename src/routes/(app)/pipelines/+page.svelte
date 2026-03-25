<script lang="ts">
  import {
    SvelteFlow,
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    Panel,
    MarkerType,
    type Edge,
  } from "@xyflow/svelte";
  import "@xyflow/svelte/dist/style.css";

  import AnimatedGradientText from "$lib/components/magic/animated-gradient-text/animated-gradient-text.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import Plus from "@lucide/svelte/icons/plus";
  import Play from "@lucide/svelte/icons/play";
  import Save from "@lucide/svelte/icons/save";

  import PipelineNode from "./nodes/PipelineNode.svelte";
  import type { PipelineNodeType, PipelineNodeData } from "./nodes/PipelineNode.svelte";

  const nodeTypes = { pipeline: PipelineNode };

  // Pre-configured pipeline nodes
  let nodes = $state.raw<PipelineNodeType[]>([
    // Data sources
    {
      id: "dataset",
      type: "pipeline",
      position: { x: 0, y: 200 },
      data: {
        label: "Dataset",
        description: "mock-dataset-001 (120 pages)",
        icon: "📦",
        category: "data",
        status: "active",
      },
    },

    // Sampling strategies
    {
      id: "active-learning",
      type: "pipeline",
      position: { x: 280, y: 80 },
      data: {
        label: "Active Learning",
        description: "Uncertainty sampling, batch=20",
        icon: "🎯",
        category: "sampling",
        status: "idle",
      },
    },
    {
      id: "stratified",
      type: "pipeline",
      position: { x: 280, y: 200 },
      data: {
        label: "Stratified Sampler",
        description: "Balance by doc_type & status",
        icon: "📊",
        category: "sampling",
        status: "active",
      },
    },
    {
      id: "random-sample",
      type: "pipeline",
      position: { x: 280, y: 320 },
      data: {
        label: "Random Sample",
        description: "n=50, seed=42",
        icon: "🎲",
        category: "sampling",
        status: "idle",
      },
    },

    // AI labelers
    {
      id: "ai-labeler-trocr",
      type: "pipeline",
      position: { x: 580, y: 80 },
      data: {
        label: "AI Labeler: TrOCR",
        description: "trocr-v2-riksarkivet, text recognition",
        icon: "🤖",
        category: "labeling",
        status: "running",
      },
    },
    {
      id: "ai-labeler-layout",
      type: "pipeline",
      position: { x: 580, y: 200 },
      data: {
        label: "AI Labeler: Layout",
        description: "dit-base, document layout analysis",
        icon: "🧠",
        category: "labeling",
        status: "active",
      },
    },
    {
      id: "weak-supervision",
      type: "pipeline",
      position: { x: 580, y: 320 },
      data: {
        label: "Weak Supervision",
        description: "Labeling functions (5 active, 2 abstain)",
        icon: "🏷️",
        category: "labeling",
        status: "idle",
      },
    },

    // ML backend
    {
      id: "ml-backend",
      type: "pipeline",
      position: { x: 880, y: 140 },
      data: {
        label: "ML Backend",
        description: "Fine-tune on accepted labels, GPU A100",
        icon: "⚡",
        category: "ml",
        status: "idle",
      },
    },

    // Evaluation
    {
      id: "ai-judge",
      type: "pipeline",
      position: { x: 880, y: 280 },
      data: {
        label: "AI Judge",
        description: "GPT-4o cross-validation, agreement threshold 0.85",
        icon: "⚖️",
        category: "evaluation",
        status: "idle",
      },
    },
    {
      id: "eval-metrics",
      type: "pipeline",
      position: { x: 1160, y: 140 },
      data: {
        label: "Evaluation Metrics",
        description: "Precision, recall, F1, inter-annotator agreement",
        icon: "📈",
        category: "evaluation",
        status: "idle",
      },
    },

    // Output
    {
      id: "export",
      type: "pipeline",
      position: { x: 1160, y: 280 },
      data: {
        label: "Export Pipeline",
        description: "Arrow IPC / COCO / ALTO XML",
        icon: "📤",
        category: "output",
        status: "idle",
      },
    },
  ]);

  const defaultEdgeOptions = {
    type: "smoothstep" as const,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: "stroke-width: 2;",
  };

  let edges = $state.raw<Edge[]>([
    // Dataset → Samplers
    { id: "e-ds-al", source: "dataset", target: "active-learning" },
    { id: "e-ds-st", source: "dataset", target: "stratified" },
    { id: "e-ds-rs", source: "dataset", target: "random-sample" },

    // Samplers → AI Labelers
    { id: "e-al-trocr", source: "active-learning", target: "ai-labeler-trocr" },
    { id: "e-st-layout", source: "stratified", target: "ai-labeler-layout" },
    { id: "e-rs-ws", source: "random-sample", target: "weak-supervision" },

    // AI Labelers → ML / Evaluation
    { id: "e-trocr-ml", source: "ai-labeler-trocr", target: "ml-backend" },
    { id: "e-layout-ml", source: "ai-labeler-layout", target: "ml-backend" },
    { id: "e-ws-judge", source: "weak-supervision", target: "ai-judge" },
    { id: "e-trocr-judge", source: "ai-labeler-trocr", target: "ai-judge" },

    // ML / Eval → Metrics / Export
    { id: "e-ml-eval", source: "ml-backend", target: "eval-metrics" },
    { id: "e-judge-eval", source: "ai-judge", target: "eval-metrics" },
    { id: "e-judge-export", source: "ai-judge", target: "export" },
    { id: "e-eval-export", source: "eval-metrics", target: "export" },
  ]);

  function onconnect(event: { source: string; target: string }) {
    edges = [
      ...edges,
      {
        id: `e-${event.source}-${event.target}`,
        source: event.source,
        target: event.target,
      },
    ];
  }

  // Node palette for adding new nodes
  const palette: { label: string; data: PipelineNodeData }[] = [
    { label: "Dataset", data: { label: "Dataset", icon: "📦", category: "data", description: "Data source" } },
    { label: "Active Learning", data: { label: "Active Learning", icon: "🎯", category: "sampling", description: "Uncertainty sampling" } },
    { label: "Stratified Sampler", data: { label: "Stratified Sampler", icon: "📊", category: "sampling", description: "Balanced sampling" } },
    { label: "AI Labeler", data: { label: "AI Labeler", icon: "🤖", category: "labeling", description: "Custom model" } },
    { label: "Weak Supervision", data: { label: "Weak Supervision", icon: "🏷️", category: "labeling", description: "Labeling functions" } },
    { label: "ML Backend", data: { label: "ML Backend", icon: "⚡", category: "ml", description: "Training pipeline" } },
    { label: "AI Judge", data: { label: "AI Judge", icon: "⚖️", category: "evaluation", description: "Quality review" } },
    { label: "Eval Metrics", data: { label: "Eval Metrics", icon: "📈", category: "evaluation", description: "Compute metrics" } },
    { label: "Export", data: { label: "Export", icon: "📤", category: "output", description: "Export pipeline" } },
  ];

  let showPalette = $state(false);
  let nodeCounter = $state(20);

  function addNode(template: (typeof palette)[0]) {
    const id = `node-${nodeCounter++}`;
    nodes = [
      ...nodes,
      {
        id,
        type: "pipeline",
        position: { x: 200 + Math.random() * 400, y: 100 + Math.random() * 300 },
        data: { ...template.data, status: "idle" },
      },
    ];
    showPalette = false;
  }
</script>

<div class="flex h-full flex-col">
  <!-- Top bar -->
  <div class="flex items-center gap-3 border-b bg-background px-4 py-1.5">
    <span class="text-sm font-medium">Pipeline Editor</span>
    <Badge variant="secondary" class="text-[10px]">{nodes.length} nodes</Badge>
    <Badge variant="outline" class="text-[10px]">{edges.length} connections</Badge>

    <div class="ml-auto flex items-center gap-1">
      <Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-xs" onclick={() => (showPalette = !showPalette)}>
        <Plus class="h-3.5 w-3.5" />
        Add Node
      </Button>
      <Separator orientation="vertical" class="h-4" />
      <Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-xs" disabled>
        <Play class="h-3.5 w-3.5" />
        <AnimatedGradientText colorFrom="#22c55e" colorTo="#3b82f6" speed={0.6} class="text-xs font-medium">
          Run Pipeline
        </AnimatedGradientText>
      </Button>
      <Button variant="outline" size="sm" class="h-7 gap-1 px-2 text-xs" disabled>
        <Save class="h-3.5 w-3.5" />
        Save
      </Button>
    </div>
  </div>

  <!-- Flow canvas -->
  <div class="flex-1">
    <SvelteFlow
      bind:nodes
      bind:edges
      {nodeTypes}
      {defaultEdgeOptions}
      {onconnect}
      fitView
      class="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showLock={false} />
      <MiniMap />

      <!-- Node palette panel -->
      {#if showPalette}
        <Panel position="top-left" class="!top-2 !left-2">
          <div class="w-56 rounded-lg border bg-popover p-2 shadow-lg">
            <span class="mb-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Add Node</span>
            <div class="flex flex-col gap-0.5">
              {#each palette as item (item.label)}
                <button
                  class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onclick={() => addNode(item)}
                >
                  <span class="text-base">{item.data.icon}</span>
                  <div>
                    <div class="font-medium">{item.label}</div>
                    <div class="text-[10px] text-muted-foreground">{item.data.description}</div>
                  </div>
                </button>
              {/each}
            </div>
          </div>
        </Panel>
      {/if}

      <!-- Legend -->
      <Panel position="bottom-left" class="!bottom-2 !left-2">
        <div class="rounded-md border bg-popover/90 px-2 py-1.5 text-[9px] backdrop-blur-sm">
          <div class="flex flex-wrap gap-x-3 gap-y-0.5">
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-blue-400"></span> Data</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-green-400"></span> Sampling</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-amber-400"></span> Labeling</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-rose-400"></span> ML</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-purple-400"></span> Evaluation</span>
            <span class="flex items-center gap-1"><span class="h-2 w-2 rounded-sm bg-cyan-400"></span> Output</span>
          </div>
        </div>
      </Panel>
    </SvelteFlow>
  </div>
</div>
