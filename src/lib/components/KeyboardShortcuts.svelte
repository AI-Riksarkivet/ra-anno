<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import Keyboard from "@lucide/svelte/icons/keyboard";

  let open = $state(false);

  $effect(() => {
    const handler = () => (open = !open);
    window.addEventListener("toggle-shortcuts", handler);
    return () => window.removeEventListener("toggle-shortcuts", handler);
  });

  const shortcuts = [
    { category: "Tools", items: [
      { keys: ["0"], action: "Pan tool" },
      { keys: ["1"], action: "Select tool" },
      { keys: ["2"], action: "Rectangle tool (edit)" },
      { keys: ["3"], action: "Polygon tool (edit)" },
      { keys: ["4"], action: "Intelligent Scissors (edit)" },
      { keys: ["5"], action: "Magnetic Cursor (edit)" },
      { keys: ["6"], action: "Lasso Select" },
    ]},
    { category: "Drawing", items: [
      { keys: ["Shift"], action: "Constrain to square (rect)" },
      { keys: ["Ctrl"], action: "Draw from center (rect)" },
      { keys: ["Backspace"], action: "Remove last vertex (polygon)" },
      { keys: ["Dbl-click"], action: "Close polygon" },
    ]},
    { category: "Selection", items: [
      { keys: ["Ctrl", "Click"], action: "Multi-select" },
      { keys: ["Alt", "Click"], action: "Cycle overlapping annotations" },
      { keys: ["Tab"], action: "Next annotation" },
      { keys: ["Shift", "Tab"], action: "Previous annotation" },
      { keys: ["P"], action: "Convert rect to polygon" },
      { keys: ["Delete"], action: "Delete selected" },
      { keys: ["Escape"], action: "Deselect / cancel" },
    ]},
    { category: "Edit", items: [
      { keys: ["Ctrl", "Z"], action: "Undo" },
      { keys: ["Ctrl", "Shift", "Z"], action: "Redo" },
      { keys: ["Ctrl", "S"], action: "Save" },
    ]},
    { category: "View", items: [
      { keys: ["Scroll"], action: "Zoom in/out" },
      { keys: ["Drag"], action: "Pan canvas" },
      { keys: ["Dbl-click"], action: "Fit to viewport" },
      { keys: ["?"], action: "Toggle this help" },
    ]},
  ];
</script>

<svelte:window onkeydown={(e) => {
  if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    open = !open;
  }
}} />

<Dialog.Root bind:open>
  <Dialog.Content class="max-h-[85vh] max-w-lg overflow-y-auto">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <Keyboard class="h-5 w-5" />
        Keyboard Shortcuts
      </Dialog.Title>
      <Dialog.Description>
        Press <kbd class="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">?</kbd> to toggle this overlay
      </Dialog.Description>
    </Dialog.Header>

    <div class="grid gap-4 py-2">
      {#each shortcuts as group (group.category)}
        <div>
          <h3 class="mb-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {group.category}
          </h3>
          <div class="space-y-1">
            {#each group.items as shortcut (shortcut.action)}
              <div class="flex items-center justify-between rounded px-2 py-1 hover:bg-muted/50">
                <span class="text-sm">{shortcut.action}</span>
                <div class="flex items-center gap-1">
                  {#each shortcut.keys as key (key)}
                    <kbd class="inline-flex h-5 min-w-5 items-center justify-center rounded border bg-muted px-1.5 text-xs font-mono text-muted-foreground">
                      {key}
                    </kbd>
                  {/each}
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </Dialog.Content>
</Dialog.Root>
