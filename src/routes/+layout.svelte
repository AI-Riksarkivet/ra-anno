<script lang="ts">
  import "../app.css";
  import type { Snippet } from "svelte";
  import * as Sidebar from "$lib/components/ui/sidebar/index.js";

  let { children }: { children: Snippet } = $props();
</script>

<Sidebar.Provider>
  <Sidebar.Root>
    <Sidebar.Header>
      <div class="flex items-center gap-2 px-2 py-1">
        <span class="text-lg font-semibold">RA Platform</span>
      </div>
    </Sidebar.Header>
    <Sidebar.Content>
      <Sidebar.Group>
        <Sidebar.GroupLabel>Navigation</Sidebar.GroupLabel>
        <Sidebar.GroupContent>
          <Sidebar.Menu>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                {#snippet child({ props })}
                  <a href="/datasets" {...props}>
                    <span>Datasets</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                {#snippet child({ props })}
                  <a href="/datasets/mock-dataset-001" {...props}>
                    <span>Browse (mock)</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
            <Sidebar.MenuItem>
              <Sidebar.MenuButton>
                {#snippet child({ props })}
                  <a href="/datasets/mock-dataset-001/doc-1/1" {...props}>
                    <span>Editor (mock)</span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          </Sidebar.Menu>
        </Sidebar.GroupContent>
      </Sidebar.Group>
    </Sidebar.Content>
  </Sidebar.Root>
  <Sidebar.Inset>
    <header class="flex h-12 items-center gap-2 border-b px-4">
      <Sidebar.Trigger />
    </header>
    <main class="flex-1 overflow-auto">
      {@render children()}
    </main>
  </Sidebar.Inset>
</Sidebar.Provider>
