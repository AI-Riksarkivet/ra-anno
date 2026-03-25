<script lang="ts">
  import { SvelteSet } from "svelte/reactivity";

  interface Point {
    page_id: string;
    doc_id: string;
    page_num: number;
    umap_x: number;
    umap_y: number;
    status: string;
    label: string;
    doc_type: string;
  }

  interface Props {
    points: Point[];
    selectedIds: Set<string>;
    filteredIds?: Set<string>;
    onselect?: (ids: Set<string>) => void;
    colorBy?: "status" | "label" | "doc_type";
  }

  let { points, selectedIds, filteredIds, onselect, colorBy = "doc_type" }: Props = $props();

  const margin = { top: 8, right: 8, bottom: 8, left: 8 };

  let containerWidth = $state(400);
  let containerHeight = $state(300);

  const plotW = $derived(containerWidth - margin.left - margin.right);
  const plotH = $derived(containerHeight - margin.top - margin.bottom);

  // Auto-scale to data extents
  const xRange = $derived.by(() => {
    if (points.length === 0) return [-1, 1];
    let min = Infinity,
      max = -Infinity;
    for (const p of points) {
      if (p.umap_x < min) min = p.umap_x;
      if (p.umap_x > max) max = p.umap_x;
    }
    const pad = (max - min) * 0.06 || 1;
    return [min - pad, max + pad];
  });

  const yRange = $derived.by(() => {
    if (points.length === 0) return [-1, 1];
    let min = Infinity,
      max = -Infinity;
    for (const p of points) {
      if (p.umap_y < min) min = p.umap_y;
      if (p.umap_y > max) max = p.umap_y;
    }
    const pad = (max - min) * 0.06 || 1;
    return [min - pad, max + pad];
  });

  function sx(val: number): number {
    return margin.left + ((val - xRange[0]) / (xRange[1] - xRange[0])) * plotW;
  }

  function sy(val: number): number {
    return margin.top + (1 - (val - yRange[0]) / (yRange[1] - yRange[0])) * plotH;
  }

  // Color palettes
  const STATUS_COLORS: Record<string, string> = {
    accepted: "#22c55e",
    reviewed: "#3b82f6",
    draft: "#f59e0b",
    prediction: "#a855f7",
    rejected: "#ef4444",
  };

  const LABEL_COLORS: Record<string, string> = {
    "text-line": "#3b82f6",
    paragraph: "#22c55e",
    header: "#f59e0b",
    "marginal-note": "#a855f7",
    "page-number": "#ef4444",
    signature: "#06b6d4",
  };

  const DOC_TYPE_COLORS: Record<string, string> = {
    handwritten: "#3b82f6",
    printed: "#22c55e",
    map: "#f59e0b",
    form: "#a855f7",
  };

  function pointColor(p: Point): string {
    if (colorBy === "label") return LABEL_COLORS[p.label] ?? "#888";
    if (colorBy === "doc_type") return DOC_TYPE_COLORS[p.doc_type] ?? "#888";
    return STATUS_COLORS[p.status] ?? "#888";
  }

  // Lasso state
  let lassoing = $state(false);
  let lassoPath = $state<[number, number][]>([]);
  let svgEl = $state<SVGSVGElement | undefined>(undefined);

  function toSvg(e: MouseEvent): [number, number] {
    const rect = svgEl!.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  function onMouseDown(e: MouseEvent) {
    if (e.button !== 0) return;
    if ((e.target as SVGElement).closest("circle")) return;
    lassoing = true;
    lassoPath = [toSvg(e)];
    e.preventDefault();
  }

  function onMouseMove(e: MouseEvent) {
    if (!lassoing) return;
    lassoPath = [...lassoPath, toSvg(e)];
  }

  function onMouseUp() {
    if (!lassoing) return;
    lassoing = false;

    if (lassoPath.length < 3) {
      lassoPath = [];
      onselect?.(new SvelteSet());
      return;
    }

    const ids = new SvelteSet<string>();
    for (const p of points) {
      if (insidePolygon(sx(p.umap_x), sy(p.umap_y), lassoPath)) {
        ids.add(p.page_id);
      }
    }
    lassoPath = [];
    onselect?.(ids);
  }

  // Ray casting point-in-polygon
  function insidePolygon(
    x: number,
    y: number,
    poly: [number, number][],
  ): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function clickPoint(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (selectedIds.has(id)) {
      const next = new SvelteSet(selectedIds);
      next.delete(id);
      onselect?.(next);
    } else {
      const next = new SvelteSet(selectedIds);
      next.add(id);
      onselect?.(next);
    }
  }

  const lassoD = $derived(
    lassoPath.length > 1
      ? "M " + lassoPath.map(([x, y]) => `${x},${y}`).join(" L ") + " Z"
      : "",
  );

  // Tooltip
  let hovered = $state<Point | null>(null);
  let tipX = $state(0);
  let tipY = $state(0);

  const hasSelection = $derived(selectedIds.size > 0);
  const hasFilter = $derived(filteredIds != null && filteredIds.size < points.length);
</script>

<div
  class="relative h-full w-full"
  bind:clientWidth={containerWidth}
  bind:clientHeight={containerHeight}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg
    bind:this={svgEl}
    width={containerWidth}
    height={containerHeight}
    class="select-none"
    onmousedown={onMouseDown}
    onmousemove={onMouseMove}
    onmouseup={onMouseUp}
    onmouseleave={() => {
      if (lassoing) {
        lassoing = false;
        lassoPath = [];
      }
    }}
  >
    <rect
      width={containerWidth}
      height={containerHeight}
      fill="transparent"
    />

    <!-- Subtle grid -->
    {#each { length: 9 } as _, i (i)}
      {@const frac = (i + 1) / 10}
      <line
        x1={margin.left + frac * plotW}
        y1={margin.top}
        x2={margin.left + frac * plotW}
        y2={margin.top + plotH}
        stroke="currentColor"
        class="text-foreground/[0.04]"
      />
      <line
        x1={margin.left}
        y1={margin.top + frac * plotH}
        x2={margin.left + plotW}
        y2={margin.top + frac * plotH}
        stroke="currentColor"
        class="text-foreground/[0.04]"
      />
    {/each}

    <!-- Points -->
    {#each points as p (p.page_id)}
      {@const px = sx(p.umap_x)}
      {@const py = sy(p.umap_y)}
      {@const sel = selectedIds.has(p.page_id)}
      {@const matchesFilter = !hasFilter || filteredIds!.has(p.page_id)}
      {@const visible = matchesFilter && (!hasSelection || sel)}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
      <circle
        cx={px}
        cy={py}
        r={sel ? 5 : 3.5}
        fill={pointColor(p)}
        opacity={visible ? 0.85 : 0.12}
        stroke={sel ? "white" : "none"}
        stroke-width={sel ? 1.5 : 0}
        class="cursor-pointer"
        onclick={(e) => clickPoint(e, p.page_id)}
        onmouseenter={(e) => {
          hovered = p;
          tipX = e.clientX;
          tipY = e.clientY;
        }}
        onmouseleave={() => {
          hovered = null;
        }}
      />
    {/each}

    <!-- Lasso path -->
    {#if lassoD}
      <path
        d={lassoD}
        fill="rgba(59,130,246,0.08)"
        stroke="rgb(59,130,246)"
        stroke-width="1.5"
        stroke-dasharray="4 2"
      />
    {/if}
  </svg>

  <!-- Tooltip -->
  {#if hovered}
    <div
      class="pointer-events-none fixed z-50 rounded border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
      style="left: {tipX + 12}px; top: {tipY - 10}px;"
    >
      <div class="font-medium">{hovered.doc_id} / p.{hovered.page_num}</div>
      <div class="text-muted-foreground">
        {hovered.status} · {hovered.label} · {hovered.doc_type}
      </div>
    </div>
  {/if}
</div>
