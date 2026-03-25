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
  import Copy from "@lucide/svelte/icons/copy";
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
  import TableProperties from "@lucide/svelte/icons/table-properties";
  import Target from "@lucide/svelte/icons/target";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import GitFork from "@lucide/svelte/icons/git-fork";
  import Code from "@lucide/svelte/icons/code";
  import User from "@lucide/svelte/icons/user";
  import X from "@lucide/svelte/icons/x";
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
        { label: "Append Column", data: { label: "Append Column", icon: TableProperties, category: "data", description: "Add predictions as new column" } },
        { label: "Conditional", data: { label: "Conditional", icon: GitFork, category: "data", description: "Route by condition" } },
        { label: "Script", data: { label: "Script", icon: Code, category: "data", description: "Custom Python/TS transform" } },
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

  // Pre-configured pipeline nodes — 5 columns, left→right
  let nodes = $state.raw<PipelineNodeType[]>([
    // Col 1 — Data
    { id: "dataset", type: "pipeline", position: { x: 0, y: 100 },
      data: { label: "Dataset", description: "mock-dataset-001 (120 pages)", icon: Database, category: "data", status: "active" } },

    // Col 2 — Sampling
    { id: "stratified", type: "pipeline", position: { x: 300, y: 0 },
      data: { label: "Stratified Sampler", description: "Balance by doc_type & status", icon: BarChart3, category: "sampling", status: "active" } },
    { id: "active-learning", type: "pipeline", position: { x: 300, y: 100 },
      data: { label: "Active Learning", description: "Uncertainty sampling, batch=20", icon: Target, category: "sampling", status: "idle" } },
    { id: "random-sample", type: "pipeline", position: { x: 300, y: 200 },
      data: { label: "Random Sample", description: "n=50, seed=42", icon: Shuffle, category: "sampling", status: "idle" } },

    // Col 3 — Labeling
    { id: "ai-labeler-trocr", type: "pipeline", position: { x: 600, y: 0 },
      data: { label: "AI Labeler: TrOCR", description: "trocr-v2-riksarkivet", icon: Sparkles, category: "labeling", status: "running" } },
    { id: "ai-labeler-layout", type: "pipeline", position: { x: 600, y: 100 },
      data: { label: "AI Labeler: Layout", description: "dit-base, layout analysis", icon: BrainCircuit, category: "labeling", status: "active" } },
    { id: "weak-supervision", type: "pipeline", position: { x: 600, y: 200 },
      data: { label: "Weak Supervision", description: "5 LFs active, 2 abstain", icon: Tags, category: "labeling", status: "idle" } },

    // Col 4 — Post-process + Eval
    { id: "append-column", type: "pipeline", position: { x: 900, y: 0 },
      data: { label: "Append Column", description: "Add predicted_label to dataset", icon: TableProperties, category: "data", status: "idle" } },
    { id: "ml-backend", type: "pipeline", position: { x: 900, y: 100 },
      data: { label: "ML Backend", description: "Fine-tune, GPU A100", icon: Zap, category: "ml", status: "idle" } },
    { id: "ai-judge", type: "pipeline", position: { x: 900, y: 200 },
      data: { label: "AI Judge", description: "GPT-4o, threshold 0.85", icon: Bot, category: "evaluation", status: "idle" } },

    // Col 5 — Output
    { id: "eval-metrics", type: "pipeline", position: { x: 1200, y: 0 },
      data: { label: "Eval Metrics", description: "Precision, recall, F1", icon: BarChart3, category: "evaluation", status: "idle" } },
    { id: "export", type: "pipeline", position: { x: 1200, y: 100 },
      data: { label: "Export", description: "Arrow IPC / COCO / ALTO XML", icon: FileOutput, category: "output", status: "idle" } },
  ]);

  const defaultEdgeOptions = {
    type: "smoothstep" as const,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: "stroke-width: 2;",
  };

  let edges = $state.raw<Edge[]>([
    // Dataset → Samplers
    { id: "e-ds-st", source: "dataset", target: "stratified" },
    { id: "e-ds-al", source: "dataset", target: "active-learning" },
    { id: "e-ds-rs", source: "dataset", target: "random-sample" },
    // Samplers → Labelers
    { id: "e-st-trocr", source: "stratified", target: "ai-labeler-trocr" },
    { id: "e-al-layout", source: "active-learning", target: "ai-labeler-layout" },
    { id: "e-rs-ws", source: "random-sample", target: "weak-supervision" },
    // Labelers → Post-process
    { id: "e-trocr-append", source: "ai-labeler-trocr", target: "append-column" },
    { id: "e-layout-ml", source: "ai-labeler-layout", target: "ml-backend" },
    { id: "e-ws-judge", source: "weak-supervision", target: "ai-judge" },
    // Post-process → Output
    { id: "e-append-eval", source: "append-column", target: "eval-metrics" },
    { id: "e-ml-eval", source: "ml-backend", target: "eval-metrics" },
    { id: "e-judge-export", source: "ai-judge", target: "export" },
    { id: "e-eval-export", source: "eval-metrics", target: "export" },
  ]);

  function onconnect(event: { source: string; target: string }) {
    edges = [
      ...edges,
      { id: `e-${event.source}-${event.target}`, source: event.source, target: event.target },
    ];
  }

  // Node config panel
  let selectedNodeId = $state<string | null>(null);
  const selectedNode = $derived(nodes.find((n) => n.id === selectedNodeId));

  function onnodeclick(event: { node: PipelineNodeType }) {
    selectedNodeId = event.node.id;
  }

  function onpaneclick() {
    selectedNodeId = null;
  }

  // Config field definitions per node label
  type ConfigField = { key: string; label: string; type: "text" | "number" | "select" | "toggle" | "range"; options?: string[]; value: string | number | boolean; description?: string };

  const nodeConfigs: Record<string, ConfigField[]> = {
    "Dataset": [
      { key: "source", label: "Source", type: "select", options: ["mock-dataset-001", "riksarkivet-htr", "census-1900"], value: "mock-dataset-001" },
      { key: "format", label: "Format", type: "select", options: ["Arrow IPC", "Parquet", "CSV", "LanceDB"], value: "Arrow IPC" },
      { key: "cache", label: "Cache locally", type: "toggle", value: true },
    ],
    "Append Column": [
      { key: "columnName", label: "Column name", type: "text", value: "predicted_label", description: "Name of the new column to add" },
      { key: "source", label: "Value source", type: "select", options: ["upstream_prediction", "constant", "expression"], value: "upstream_prediction" },
      { key: "overwrite", label: "Overwrite if exists", type: "toggle", value: false },
    ],
    "Conditional": [
      { key: "condition", label: "Condition", type: "text", value: "confidence > 0.8", description: "Expression to evaluate per row" },
      { key: "trueLabel", label: "True → output", type: "text", value: "high_confidence" },
      { key: "falseLabel", label: "False → output", type: "text", value: "low_confidence" },
    ],
    "Script": [
      { key: "language", label: "Language", type: "select", options: ["Python", "TypeScript", "SQL"], value: "Python" },
      { key: "code", label: "Script", type: "text", value: "df['combined'] = df['trocr'] + df['layout']", description: "Custom transform code" },
      { key: "timeout", label: "Timeout (s)", type: "number", value: 300 },
    ],
    "Data Filter": [
      { key: "column", label: "Filter column", type: "select", options: ["status", "label", "doc_type", "confidence"], value: "status" },
      { key: "operator", label: "Operator", type: "select", options: ["equals", "not equals", "in", "greater than", "less than"], value: "equals" },
      { key: "filterValue", label: "Value", type: "text", value: "accepted" },
    ],
    "Active Learning": [
      { key: "strategy", label: "Strategy", type: "select", options: ["uncertainty", "margin", "entropy", "random", "diversity"], value: "uncertainty", description: "How to select the most informative samples" },
      { key: "batchSize", label: "Batch size", type: "number", value: 20 },
      { key: "model", label: "Model", type: "text", value: "trocr-v2-riksarkivet" },
      { key: "minConfidence", label: "Min confidence", type: "range", value: 0.3 },
    ],
    "Stratified Sampler": [
      { key: "stratifyBy", label: "Stratify by", type: "select", options: ["doc_type", "status", "label", "source"], value: "doc_type" },
      { key: "sampleSize", label: "Sample size", type: "number", value: 50 },
      { key: "balanced", label: "Force balanced", type: "toggle", value: true },
    ],
    "Random Sample": [
      { key: "n", label: "Sample size", type: "number", value: 50 },
      { key: "seed", label: "Random seed", type: "number", value: 42 },
      { key: "replacement", label: "With replacement", type: "toggle", value: false },
    ],
    "AI Labeler": [
      { key: "model", label: "Model", type: "select", options: ["trocr-v2-riksarkivet", "dit-base-finetuned", "layoutlmv3", "custom"], value: "trocr-v2-riksarkivet" },
      { key: "confidence", label: "Min confidence", type: "range", value: 0.5 },
      { key: "batchSize", label: "Batch size", type: "number", value: 32 },
      { key: "gpu", label: "GPU", type: "select", options: ["auto", "A100", "T4", "CPU"], value: "auto" },
    ],
    "AI Labeler: TrOCR": [
      { key: "model", label: "Model", type: "text", value: "trocr-v2-riksarkivet", description: "HuggingFace model ID" },
      { key: "confidence", label: "Min confidence", type: "range", value: 0.5 },
      { key: "batchSize", label: "Batch size", type: "number", value: 32 },
      { key: "gpu", label: "GPU", type: "select", options: ["auto", "A100", "T4", "CPU"], value: "auto" },
    ],
    "AI Labeler: Layout": [
      { key: "model", label: "Model", type: "text", value: "dit-base-finetuned", description: "Layout analysis model" },
      { key: "labels", label: "Labels", type: "text", value: "text-line,paragraph,header,marginal-note" },
      { key: "nmsThreshold", label: "NMS threshold", type: "range", value: 0.5 },
    ],
    "Weak Supervision": [
      { key: "lfCount", label: "Labeling functions", type: "number", value: 5 },
      { key: "resolver", label: "Conflict resolver", type: "select", options: ["majority_vote", "snorkel_label_model", "dawid_skene", "weighted"], value: "majority_vote" },
      { key: "minCoverage", label: "Min coverage", type: "range", value: 0.3 },
      { key: "abstainThreshold", label: "Abstain threshold", type: "range", value: 0.1 },
    ],
    "Human Review": [
      { key: "assignees", label: "Assignees", type: "text", value: "team-annotators", description: "User group or comma-separated usernames" },
      { key: "redundancy", label: "Annotators per item", type: "number", value: 2 },
      { key: "deadline", label: "Deadline (days)", type: "number", value: 7 },
    ],
    "ML Backend": [
      { key: "framework", label: "Framework", type: "select", options: ["PyTorch", "JAX", "TensorFlow", "ONNX"], value: "PyTorch" },
      { key: "epochs", label: "Epochs", type: "number", value: 10 },
      { key: "lr", label: "Learning rate", type: "text", value: "3e-5" },
      { key: "gpu", label: "GPU", type: "select", options: ["A100", "H100", "T4", "CPU"], value: "A100" },
      { key: "checkpoint", label: "Save checkpoints", type: "toggle", value: true },
    ],
    "Embedding Model": [
      { key: "model", label: "Model", type: "select", options: ["all-MiniLM-L6-v2", "intfloat/e5-large", "BAAI/bge-base", "custom"], value: "all-MiniLM-L6-v2" },
      { key: "dims", label: "Dimensions", type: "number", value: 384 },
      { key: "normalize", label: "L2 normalize", type: "toggle", value: true },
    ],
    "AI Judge": [
      { key: "model", label: "Judge model", type: "select", options: ["GPT-4o", "Claude 3.5", "Gemini Pro", "local-llama"], value: "GPT-4o" },
      { key: "threshold", label: "Agreement threshold", type: "range", value: 0.85 },
      { key: "criteria", label: "Criteria", type: "text", value: "accuracy,completeness,consistency" },
      { key: "maxTokens", label: "Max tokens", type: "number", value: 1024 },
    ],
    "Evaluation Metrics": [
      { key: "metrics", label: "Metrics", type: "text", value: "precision,recall,f1,accuracy", description: "Comma-separated metric names" },
      { key: "average", label: "Averaging", type: "select", options: ["micro", "macro", "weighted", "binary"], value: "macro" },
      { key: "bootstrap", label: "Bootstrap CI", type: "toggle", value: false },
    ],
    "Consensus": [
      { key: "method", label: "Method", type: "select", options: ["fleiss_kappa", "cohen_kappa", "krippendorff_alpha", "percent_agreement"], value: "fleiss_kappa" },
      { key: "minAnnotators", label: "Min annotators", type: "number", value: 2 },
      { key: "threshold", label: "Agreement threshold", type: "range", value: 0.7 },
    ],
    "Export Pipeline": [
      { key: "format", label: "Format", type: "select", options: ["Arrow IPC", "COCO JSON", "ALTO XML", "Parquet", "CSV"], value: "Arrow IPC" },
      { key: "destination", label: "Destination", type: "select", options: ["local", "S3", "MinIO", "GCS"], value: "local" },
      { key: "path", label: "Output path", type: "text", value: "/output/export" },
      { key: "compress", label: "Compress", type: "toggle", value: true },
    ],
    "Webhook": [
      { key: "url", label: "URL", type: "text", value: "https://hooks.example.com/pipeline" },
      { key: "method", label: "Method", type: "select", options: ["POST", "PUT", "PATCH"], value: "POST" },
      { key: "events", label: "Events", type: "text", value: "completed,failed" },
    ],
    "Eval Metrics": [
      { key: "metrics", label: "Metrics", type: "text", value: "precision,recall,f1" },
      { key: "average", label: "Averaging", type: "select", options: ["micro", "macro", "weighted"], value: "macro" },
    ],
    "Export": [
      { key: "format", label: "Format", type: "select", options: ["Arrow IPC", "COCO JSON", "ALTO XML", "Parquet"], value: "Arrow IPC" },
      { key: "destination", label: "Destination", type: "select", options: ["local", "S3", "MinIO"], value: "local" },
    ],
  };

  const selectedConfig = $derived(
    selectedNode ? (nodeConfigs[selectedNode.data.label] ?? []) : [],
  );
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
      {onnodeclick}
      {onpaneclick}
      fitView
      proOptions={{ hideAttribution: true }}
      class="bg-background"
    >
      <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
      <Controls showLock={false} position="bottom-left" />
      <MiniMap position="bottom-right" />

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

  <!-- Node config panel (right sidebar) -->
  {#if selectedNode}
    <div class="flex h-full w-72 flex-col border-l bg-background">
      <div class="flex items-center gap-2 border-b px-3 py-2">
        {#if selectedNode.data.icon}
          {@const Icon = selectedNode.data.icon}
          <Icon class="h-4 w-4 text-muted-foreground" />
        {/if}
        <span class="text-sm font-medium">{selectedNode.data.label}</span>
        <button class="ml-auto text-muted-foreground hover:text-foreground" onclick={() => (selectedNodeId = null)}>
          <X class="h-4 w-4" />
        </button>
      </div>

      <div class="flex-1 overflow-y-auto p-3">
        {#if selectedNode.data.description}
          <p class="mb-3 text-xs text-muted-foreground">{selectedNode.data.description}</p>
        {/if}

        <!-- Status -->
        <div class="mb-4">
          <label class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</label>
          <select class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none">
            <option selected={selectedNode.data.status === "idle"}>idle</option>
            <option selected={selectedNode.data.status === "active"}>active</option>
            <option selected={selectedNode.data.status === "running"}>running</option>
            <option selected={selectedNode.data.status === "error"}>error</option>
          </select>
        </div>

        <Separator class="mb-4" />

        <!-- Config fields -->
        {#each selectedConfig as field (field.key)}
          <div class="mb-3">
            <label class="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{field.label}</label>
            {#if field.description}
              <p class="mb-1 text-[9px] text-muted-foreground">{field.description}</p>
            {/if}

            {#if field.type === "text"}
              <input
                type="text"
                class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                value={field.value}
              />
            {:else if field.type === "number"}
              <input
                type="number"
                class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                value={field.value}
              />
            {:else if field.type === "select"}
              <select class="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none">
                {#each field.options ?? [] as opt (opt)}
                  <option selected={opt === field.value}>{opt}</option>
                {/each}
              </select>
            {:else if field.type === "toggle"}
              <button
                class="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs {field.value ? 'bg-primary/10 border-primary/30' : ''}"
              >
                <span class="flex h-4 w-8 rounded-full {field.value ? 'bg-primary' : 'bg-muted'}">
                  <span class="h-4 w-4 rounded-full bg-background shadow-sm transition-transform {field.value ? 'translate-x-4' : 'translate-x-0'}"></span>
                </span>
                <span>{field.value ? "Enabled" : "Disabled"}</span>
              </button>
            {:else if field.type === "range"}
              <div class="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={field.value}
                  class="h-1.5 flex-1 appearance-none rounded bg-muted accent-primary"
                />
                <span class="w-8 text-right text-xs tabular-nums text-muted-foreground">{field.value}</span>
              </div>
            {/if}
          </div>
        {/each}

        {#if selectedConfig.length === 0}
          <p class="text-xs text-muted-foreground">No configuration available for this node type.</p>
        {/if}
      </div>

      <!-- Node actions -->
      <div class="border-t p-3">
        <div class="flex gap-1.5">
          <Button variant="outline" size="sm" class="flex-1 gap-1 text-xs" disabled>
            <Copy class="h-3 w-3" />
            Duplicate
          </Button>
          <Button variant="outline" size="sm" class="gap-1 text-xs text-destructive hover:bg-destructive/10" onclick={() => {
            nodes = nodes.filter((n) => n.id !== selectedNodeId);
            edges = edges.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId);
            selectedNodeId = null;
          }}>
            <Trash2 class="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  {/if}
</div>
