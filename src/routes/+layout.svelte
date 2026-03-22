<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import Database from "@lucide/svelte/icons/database";
  import Menu from "@lucide/svelte/icons/menu";
  import Keyboard from "@lucide/svelte/icons/keyboard";

  let { children }: { children: Snippet } = $props();
  let menuOpen = $state(false);

  // Smart breadcrumbs — only link to routes that exist
  const breadcrumbs = $derived.by(() => {
    const path = page.url.pathname;
    const parts = path.split("/").filter(Boolean);
    const crumbs: { label: string; href: string | null }[] = [];

    if (parts[0] === "datasets") {
      crumbs.push({ label: "datasets", href: "/datasets" });

      if (parts[1]) {
        // datasetId → links to gallery
        crumbs.push({ label: parts[1], href: `/datasets/${parts[1]}` });

        if (parts[2] && parts[3]) {
          // docId + pageNum → show as "doc / page" linking to editor
          crumbs.push({
            label: `${parts[2]} / p.${parts[3]}`,
            href: null,
          });
        }
      }
    } else {
      // Fallback for other routes
      let href = "";
      for (const part of parts) {
        href += `/${part}`;
        crumbs.push({ label: part, href });
      }
    }

    return crumbs;
  });
</script>

<!-- Top navbar -->
<header class="flex h-11 items-center gap-2 border-b bg-background px-3">
  <!-- Logo + menu -->
  <div class="relative">
    <button
      class="flex items-center gap-2 rounded-md px-2 py-1 font-semibold hover:bg-muted"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <Database class="h-4 w-4" />
      <span class="text-sm">RA Platform</span>
      <Menu class="h-3 w-3 text-muted-foreground" />
    </button>

    {#if menuOpen}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <div
        class="fixed inset-0 z-40"
        onclick={() => (menuOpen = false)}
      ></div>
      <div class="absolute left-0 top-full z-50 mt-1 w-48 rounded-md border bg-popover p-1 shadow-md">
        <a
          href="/datasets"
          class="block rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          All Datasets
        </a>
        <a
          href="/datasets/mock-dataset-001"
          class="block rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Browse (mock)
        </a>
        <a
          href="/datasets/mock-dataset-001/doc-1/1"
          class="block rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Editor (mock)
        </a>
        <div class="my-1 h-px bg-border"></div>
        <a
          href="/test"
          class="block rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Canvas Test
        </a>
      </div>
    {/if}
  </div>

  <Separator orientation="vertical" class="h-5" />

  <!-- Breadcrumbs -->
  <nav class="flex items-center gap-1 text-sm text-muted-foreground">
    {#each breadcrumbs as crumb, i (i)}
      {#if i > 0}
        <span class="text-muted-foreground/40">/</span>
      {/if}
      {#if crumb.href && i < breadcrumbs.length - 1}
        <a href={crumb.href} class="hover:text-foreground">{crumb.label}</a>
      {:else}
        <span class="text-foreground">{crumb.label}</span>
      {/if}
    {/each}
  </nav>

  <div class="ml-auto flex items-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 w-7 p-0"
      title="Keyboard shortcuts (?)"
    >
      <Keyboard class="h-4 w-4" />
    </Button>
  </div>
</header>

<!-- Full-height content below navbar -->
<main class="flex h-[calc(100vh-2.75rem)] flex-col overflow-hidden">
  {@render children()}
</main>
