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
  import BarChart3 from "@lucide/svelte/icons/bar-chart-3";
  import Bell from "@lucide/svelte/icons/bell";
  import Bot from "@lucide/svelte/icons/bot";
  import BrainCircuit from "@lucide/svelte/icons/brain-circuit";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Database from "@lucide/svelte/icons/database";
  import Dna from "@lucide/svelte/icons/dna";
  import FileOutput from "@lucide/svelte/icons/file-output";
  import Filter from "@lucide/svelte/icons/filter";
  import FolderOpen from "@lucide/svelte/icons/folder-open";
  import Handshake from "@lucide/svelte/icons/handshake";
  import Play from "@lucide/svelte/icons/play";
  import Save from "@lucide/svelte/icons/save";
  import Shuffle from "@lucide/svelte/icons/shuffle";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Tags from "@lucide/svelte/icons/tags";
  import Target from "@lucide/svelte/icons/target";
  import User from "@lucide/svelte/icons/user";
  import Zap from "@lucide/svelte/icons/zap";

  import PipelineNode from "./nodes/PipelineNode.svelte";
  import type { PipelineNodeType, PipelineNodeData } from "./nodes/PipelineNode.svelte";

  const nodeTypes = { pipeline: PipelineNode };

  // Project config
  let projectName = $state("HTR Pipeline v1");
  let datasetId = $state("mock-dataset-001");

  // Node palette grouped by category
  const paletteGroups: { category: string; color: string; items: { label: string; data: PipelineNodeData }[] }[] = [
    {
      category: "Data",
      color: "bg-blue-400",
      items: [
        { label: "Dataset", data: { label: "Dataset", icon: Database, category: "data", description: "Data source" } },
        { label: "Data Filter", data: { label: "Data Filter", icon: Filter, category: "data", description: "Filter by criteria" } },
      ],
    },
    {
      category: "Sampling",
      color: "bg-green-400",
      items: [
        { label: "Active Learning", data: { label: "Active Learning", icon: Target, category: "sampling", description: "Uncertainty sampling" } },
        { label: "Stratified Sampler", data: { label: "Stratified Sampler", icon: BarChart3, category: "sampling", description: "Balanced sampling" } },
        { label: "Random Sample", data: { label: "Random Sample", icon: Shuffle, category: "sampling", description: "Random subset" } },
      ],
    },
    {
      category: "Labeling",
      color: "bg-amber-400",
      items: [
        { label: "AI Labeler", data: { label: "AI Labeler", icon: Sparkles, category: "labeling", description: "Custom model" } },
        { label: "Weak Supervision", data: { label: "Weak Supervision", icon: Tags, category: "labeling", description: "Labeling functions" } },
        { label: "Human Review", data: { label: "Human Review", icon: User, category: "labeling", description: "Manual annotation queue" } },
      ],
    },
    {
      category: "ML",
      color: "bg-rose-400",
      items: [
        { label: "ML Backend", data: { label: "ML Backend", icon: Zap, category: "ml", description: "Training pipeline" } },
        { label: "Embedding Model", data: { label: "Embedding Model", icon: Dna, category: "ml", description: "Feature extraction" } },
      ],
    },
    {
      category: "Evaluation",
      color: "bg-purple-400",
      items: [
        { label: "AI Judge", data: { label: "AI Judge", icon: Bot, category: "evaluation", description: "Quality review" } },
        { label: "Eval Metrics", data: { label: "Eval Metrics", icon: BarChart3, category: "evaluation", description: "Compute metrics" } },
        { label: "Consensus", data: { label: "Consensus", icon: Handshake, category: "evaluation", description: "Inter-annotator agreement" } },
      ],
    },
    {
      category: "Output",
      color: "bg-cyan-400",
      items: [
        { label: "Export", data: { label: "Export", icon: FileOutput, category: "output", description: "Export pipeline" } },
        { label: "Webhook", data: { label: "Webhook", icon: Bell, category: "output", description: "Notify external service" } },
      ],
    },
  ];

  let collapsedGroups = $state<Set<string>>(new Set());

  function toggleGroup(category: string) {
    const next = new Set(collapsedGroups);
    if (next.has(category)) next.delete(category);
    else next.add(category);
    collapsedGroups = next;
  }

  let nodeCounter = $state(20);

  function addNode(template: { label: string; data: PipelineNodeData }) {
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
  }

  // Pre-configured pipeline nodes
  let nodes = $state.raw<PipelineNodeType[]>([
    {
      id: "dataset",
      type: "pipeline",
      position: { x: 0, y: 200 },
      data: { label: "Dataset", description: "mock-dataset-001 (120 pages)", icon: Database, category: "data", status: "active" },
    },
    {
      id: "active-learning",
      type: "pipeline",
      position: { x: 280, y: 80 },
      data: { label: "Active Learning", description: "Uncertainty sampling, batch=20", icon: Target, category: "sampling", status: "idle" },
    },
    {
      id: "stratified",
      type: "pipeline",
      position: { x: 280, y: 200 },
      data: { label: "Stratified Sampler", description: "Balance by doc_type & status", icon: BarChart3, category: "sampling", status: "active" },
    },
    {
      id: "random-sample",
      type: "pipeline",
      position: { x: 280, y: 320 },
      data: { label: "Random Sample", description: "n=50, seed=42", icon: Shuffle, category: "sampling", status: "idle" },
    },
    {
      id: "ai-labeler-trocr",
      type: "pipeline",
      position: { x: 580, y: 80 },
      data: { label: "AI Labeler: TrOCR", description: "trocr-v2-riksarkivet", icon: Sparkles, category: "labeling", status: "running" },
    },
    {
      id: "ai-labeler-layout",
      type: "pipeline",
      position: { x: 580, y: 200 },
      data: { label: "AI Labeler: Layout", description: "dit-base, layout analysis", icon: BrainCircuit, category: "labeling", status: "active" },
    },
    {
      id: "weak-supervision",
      type: "pipeline",
      position: { x: 580, y: 320 },
      data: { label: "Weak Supervision", description: "5 LFs active, 2 abstain", icon: Tags, category: "labeling", status: "idle" },
    },
    {
      id: "ml-backend",
      type: "pipeline",
      position: { x: 880, y: 140 },
      data: { label: "ML Backend", description: "Fine-tune, GPU A100", icon: Zap, category: "ml", status: "idle" },
    },
    {
      id: "ai-judge",
      type: "pipeline",
      position: { x: 880, y: 280 },
      data: { label: "AI Judge", description: "GPT-4o, threshold 0.85", icon: Bot, category: "evaluation", status: "idle" },
    },
    {
      id: "eval-metrics",
      type: "pipeline",
      position: { x: 1160, y: 140 },
      data: { label: "Evaluation Metrics", description: "Precision, recall, F1", icon: BarChart3, category: "evaluation", status: "idle" },
    },
    {
      id: "export",
      type: "pipeline",
      position: { x: 1160, y: 280 },
      data: { label: "Export Pipeline", description: "Arrow IPC / COCO / ALTO XML", icon: FileOutput, category: "output", status: "idle" },
    },
  ]);

  const defaultEdgeOptions = {
    type: "smoothstep" as const,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: "stroke-width: 2;",
  };

  let edges = $state.raw<Edge[]>([
    { id: "e-ds-al", source: "dataset", target: "active-learning" },
    { id: "e-ds-st", source: "dataset", target: "stratified" },
    { id: "e-ds-rs", source: "dataset", target: "random-sample" },
    { id: "e-al-trocr", source: "active-learning", target: "ai-labeler-trocr" },
    { id: "e-st-layout", source: "stratified", target: "ai-labeler-layout" },
    { id: "e-rs-ws", source: "random-sample", target: "weak-supervision" },
    { id: "e-trocr-ml", source: "ai-labeler-trocr", target: "ml-backend" },
    { id: "e-layout-ml", source: "ai-labeler-layout", target: "ml-backend" },
    { id: "e-ws-judge", source: "weak-supervision", target: "ai-judge" },
    { id: "e-trocr-judge", source: "ai-labeler-trocr", target: "ai-judge" },
    { id: "e-ml-eval", source: "ml-backend", target: "eval-metrics" },
    { id: "e-judge-eval", source: "ai-judge", target: "eval-metrics" },
    { id: "e-judge-export", source: "ai-judge", target: "export" },
    { id: "e-eval-export", source: "eval-metrics", target: "export" },
  ]);

  function onconnect(event: { source: string; target: string }) {
    edges = [
      ...edges,
      { id: `e-${event.source}-${event.target}`, source: event.source, target: event.target },
    ];
  }
</script>

<div class="flex h-full">
  <!-- Left sidebar: project config + node palette -->
  <div class="flex h-full w-64 flex-col border-r bg-background">
    <!-- Project config + actions -->
    <div class="border-b p-3">
      <span class="mb-2 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Project</span>
      <input
        type="text"
        class="mb-2 w-full rounded-md border border-border bg-background px-2 py-1 text-xs font-medium focus:border-primary focus:outline-none"
        bind:value={projectName}
      />
      <div class="mb-3 flex items-center gap-1.5 rounded-md border border-border px-2 py-1">
        <Database class="h-3 w-3 text-muted-foreground" />
        <select
          class="flex-1 bg-transparent text-xs focus:outline-none"
          bind:value={datasetId}
        >
          <option value="mock-dataset-001">mock-dataset-001</option>
          <option value="riksarkivet-htr">riksarkivet-htr</option>
          <option value="census-1900">census-1900</option>
        </select>
      </div>
      <div class="flex flex-col gap-1.5">
        <Button variant="default" size="sm" class="w-full justify-start gap-2 text-xs" disabled>
          <Play class="h-3.5 w-3.5" />
          <AnimatedGradientText colorFrom="#22c55e" colorTo="#3b82f6" speed={0.6} class="text-xs font-medium">
            Run Pipeline
          </AnimatedGradientText>
        </Button>
        <div class="flex gap-1.5">
          <Button variant="outline" size="sm" class="flex-1 justify-start gap-1.5 text-xs" disabled>
            <Save class="h-3 w-3" />
            Save
          </Button>
          <Button variant="outline" size="sm" class="flex-1 justify-start gap-1.5 text-xs" disabled>
            <FolderOpen class="h-3 w-3" />
            Load
          </Button>
        </div>
      </div>
    </div>

    <!-- Node palette -->
    <div class="flex-1 overflow-y-auto">
      <div class="p-2">
        <span class="mb-1.5 block px-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nodes</span>
        {#each paletteGroups as group (group.category)}
          <div class="mb-1">
            <button
              class="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent"
              onclick={() => toggleGroup(group.category)}
            >
              <span class="h-2 w-2 rounded-sm {group.color}"></span>
              {group.category}
              <ChevronDown class="ml-auto h-3 w-3 transition-transform {collapsedGroups.has(group.category) ? '-rotate-90' : ''}" />
            </button>
            {#if !collapsedGroups.has(group.category)}
              <div class="ml-1 mt-0.5 flex flex-col gap-0.5">
                {#each group.items as item (item.label)}
                  <button
                    class="flex items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-accent"
                    onclick={() => addNode(item)}
                  >
                    {#if item.data.icon}
                      {@const Icon = item.data.icon}
                      <Icon class="h-4 w-4 shrink-0 text-muted-foreground" />
                    {/if}
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-[11px] font-medium">{item.label}</div>
                      <div class="truncate text-[9px] text-muted-foreground">{item.data.description}</div>
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/each}
      </div>
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
      <Controls showLock={false} position="bottom-right" />
      <MiniMap position="bottom-right" class="!bottom-12" />

      <!-- Stats bar -->
      <Panel position="top-left" class="!top-2 !left-2">
        <div class="flex items-center gap-2 rounded-md border bg-popover/90 px-2.5 py-1 text-[10px] backdrop-blur-sm">
          <Badge variant="secondary" class="text-[10px]">{nodes.length} nodes</Badge>
          <Badge variant="outline" class="text-[10px]">{edges.length} edges</Badge>
          <span class="text-muted-foreground">·</span>
          <span class="text-muted-foreground">{projectName}</span>
          <span class="text-muted-foreground">·</span>
          <span class="text-muted-foreground">{datasetId}</span>
        </div>
      </Panel>

      <!-- Legend -->
      <Panel position="top-right" class="!top-2 !right-2">
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
