<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Separator } from "$lib/components/ui/separator/index.js";
  import ScanSearch from "@lucide/svelte/icons/scan-search";
  import Menu from "@lucide/svelte/icons/menu";
  import Keyboard from "@lucide/svelte/icons/keyboard";
  import Sun from "@lucide/svelte/icons/sun";
  import Moon from "@lucide/svelte/icons/moon";
  import { browser } from "$app/environment";

  let { children }: { children: Snippet } = $props();
  let menuOpen = $state(false);

  // Theme: read from localStorage or OS preference, apply .dark class to <html>
  let dark = $state(false);
  if (browser) {
    const stored = localStorage.getItem("theme");
    dark = stored ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.classList.toggle("dark", dark);
  }

  function toggleTheme() {
    dark = !dark;
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }

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
<header class="flex h-10 items-center border-b bg-background">
  <!-- Logo + menu -->
  <div class="relative">
    <button
      class="flex h-10 items-center gap-2 px-3 text-sm font-semibold tracking-tight hover:bg-muted"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <ScanSearch class="h-4 w-4 text-primary" />
      <span>RA-ANNO</span>
      <Menu class="h-3 w-3 text-muted-foreground" />
    </button>

    {#if menuOpen}
      <div
        class="fixed inset-0 z-40"
        role="presentation"
        onclick={() => (menuOpen = false)}
      ></div>
      <div class="absolute left-0 top-full z-50 mt-0.5 w-48 rounded-md border bg-popover p-1 shadow-md">
        <a
          href="/datasets"
          class="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          All Datasets
        </a>
        <a
          href="/datasets/mock-dataset-001"
          class="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Browse (mock)
        </a>
        <a
          href="/datasets/mock-dataset-001/doc-1/1"
          class="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Editor (mock)
        </a>
        <Separator class="my-1" />
        <a
          href="/test"
          class="flex items-center gap-2 rounded-sm px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent"
          onclick={() => (menuOpen = false)}
        >
          Canvas Test
        </a>
      </div>
    {/if}
  </div>

  <Separator orientation="vertical" class="h-5" />

  <!-- Breadcrumbs -->
  <nav class="flex items-center gap-1 px-2 text-sm text-muted-foreground">
    {#each breadcrumbs as crumb, i (i)}
      {#if i > 0}
        <span class="text-muted-foreground/30">/</span>
      {/if}
      {#if crumb.href && i < breadcrumbs.length - 1}
        <a href={crumb.href} class="hover:text-foreground">{crumb.label}</a>
      {:else}
        <span class="text-foreground">{crumb.label}</span>
      {/if}
    {/each}
  </nav>

  <div class="ml-auto flex items-center gap-0.5 pr-2">
    <Button
      variant="ghost"
      size="sm"
      class="h-7 w-7 p-0"
      title="Keyboard shortcuts (?)"
      onclick={() => window.dispatchEvent(new CustomEvent("toggle-shortcuts"))}
    >
      <Keyboard class="h-3.5 w-3.5" />
    </Button>
    <Button
      variant="ghost"
      size="sm"
      class="h-7 w-7 p-0"
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onclick={toggleTheme}
    >
      {#if dark}
        <Sun class="h-3.5 w-3.5" />
      {:else}
        <Moon class="h-3.5 w-3.5" />
      {/if}
    </Button>
  </div>
</header>

<!-- Full-height content below navbar -->
<main class="flex h-[calc(100vh-2.5rem)] flex-col overflow-hidden">
  {@render children()}
</main>
