<script lang="ts">
  import AnimatedGridPattern from "$lib/components/magic/animated-grid-pattern/animated-grid-pattern.svelte";
  import TypingAnimation from "$lib/components/magic/typing-animation/typing-animation.svelte";
  import AnimatedGradientText from "$lib/components/magic/animated-gradient-text/animated-gradient-text.svelte";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ArrowRight from "@lucide/svelte/icons/arrow-right";
  import Database from "@lucide/svelte/icons/database";
  import Pencil from "@lucide/svelte/icons/pencil";
  import GitBranch from "@lucide/svelte/icons/git-branch";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import Bot from "@lucide/svelte/icons/bot";
  import ScatterChart from "@lucide/svelte/icons/scatter-chart";
</script>

<div class="relative flex h-full flex-col items-center justify-center overflow-hidden">
  <!-- Animated background -->
  <AnimatedGridPattern
    numSquares={40}
    maxOpacity={0.08}
    duration={4}
    repeatDelay={1}
    class="absolute inset-0 [mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
  />

  <!-- Content -->
  <div class="relative z-10 flex max-w-2xl flex-col items-center px-6 text-center">
    <!-- Badge -->
    <Badge variant="outline" class="mb-6 gap-1.5 px-3 py-1 text-xs">
      <span class="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
      Work in progress — not for production use
    </Badge>

    <!-- Title -->
    <h1 class="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
      <AnimatedGradientText colorFrom="#3b82f6" colorTo="#a855f7" speed={1} class="text-4xl font-bold tracking-tight sm:text-5xl">
        RA-ANNO
      </AnimatedGradientText>
    </h1>

    <!-- Typing subtitle -->
    <div class="mb-6 h-8">
      <TypingAnimation
        words={[
          "Document annotation platform",
          "AI-assisted labeling",
          "Weak supervision pipelines",
          "Active learning workflows",
          "Built for Riksarkivet",
        ]}
        loop
        typeSpeed={60}
        deleteSpeed={30}
        pauseDelay={2000}
        class="text-lg text-muted-foreground"
        cursorStyle="line"
      />
    </div>

    <!-- Description -->
    <p class="mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
      Explore, annotate, and label historical documents at scale. Configure ML pipelines,
      embed-based sampling, and AI-assisted review — all in one platform.
    </p>

    <!-- CTA buttons -->
    <div class="mb-12 flex flex-wrap items-center justify-center gap-3">
      <Button href="/datasets" variant="default" size="default" class="gap-2">
        <Database class="h-4 w-4" />
        Browse Datasets
        <ArrowRight class="h-4 w-4" />
      </Button>
      <Button href="/datasets/mock-dataset-001/doc-1/1" variant="outline" size="default" class="gap-2">
        <Pencil class="h-4 w-4" />
        Open Editor
      </Button>
      <Button href="/pipelines" variant="outline" size="default" class="gap-2">
        <GitBranch class="h-4 w-4" />
        Pipelines
      </Button>
    </div>

    <Separator class="mb-8 w-48" />

    <!-- Feature grid -->
    <div class="grid w-full max-w-lg grid-cols-2 gap-4 text-left sm:grid-cols-3">
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <Database class="mb-2 h-5 w-5 text-blue-500" />
        <h3 class="text-xs font-semibold">Browse & Filter</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">Gallery with UMAP scatter plot, range filters, sort</p>
      </div>
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <Pencil class="mb-2 h-5 w-5 text-amber-500" />
        <h3 class="text-xs font-semibold">Annotate</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">Rect, polygon, scissors, magnetic — bulk label support</p>
      </div>
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <ScatterChart class="mb-2 h-5 w-5 text-green-500" />
        <h3 class="text-xs font-semibold">Embeddings</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">UMAP visualization with lasso selection</p>
      </div>
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <Sparkles class="mb-2 h-5 w-5 text-purple-500" />
        <h3 class="text-xs font-semibold">AI Label</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">AI-assisted annotation with custom models</p>
      </div>
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <Bot class="mb-2 h-5 w-5 text-rose-500" />
        <h3 class="text-xs font-semibold">AI Judge</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">Automated quality review and consensus</p>
      </div>
      <div class="rounded-lg border bg-card/50 p-3 backdrop-blur-sm">
        <GitBranch class="mb-2 h-5 w-5 text-cyan-500" />
        <h3 class="text-xs font-semibold">Pipelines</h3>
        <p class="mt-1 text-[10px] leading-tight text-muted-foreground">Visual flow editor for data processing</p>
      </div>
    </div>
  </div>
</div>
