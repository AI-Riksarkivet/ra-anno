import type { RequestHandler } from "./$types";

// Column schema — in production inferred from Lance table schema
const COLUMNS = [
  { name: "page_id", type: "string" },
  { name: "doc_id", type: "string" },
  { name: "page_num", type: "number" },
  { name: "width", type: "number" },
  { name: "height", type: "number" },
  { name: "annotation_count", type: "number" },
  {
    name: "status",
    type: "enum",
    values: ["accepted", "reviewed", "draft", "prediction", "rejected"],
  },
  {
    name: "label",
    type: "enum",
    values: [
      "text-line",
      "paragraph",
      "header",
      "marginal-note",
      "page-number",
      "signature",
    ],
  },
  {
    name: "doc_type",
    type: "enum",
    values: ["handwritten", "printed", "map", "form"],
  },
  { name: "umap_x", type: "number" },
  { name: "umap_y", type: "number" },
] as const;

// UMAP cluster centers by doc_type (simulating 2D projection of embeddings)
const DOC_TYPE_CENTERS: Record<string, [number, number]> = {
  handwritten: [-4, 3],
  printed: [4, -2],
  map: [-2, -4],
  form: [3, 4],
};

const LABEL_SUB_OFFSETS: Record<string, [number, number]> = {
  "text-line": [0.3, -0.2],
  paragraph: [-0.4, 0.3],
  header: [0.1, 0.5],
  "marginal-note": [-0.5, -0.1],
  "page-number": [0.2, -0.4],
  signature: [-0.1, 0.6],
};

// Mock page data — 24 pages per document, 5 documents = 120 pages
const PAGES_PER_DOC = 24;
const MOCK_PAGES = Array.from({ length: 120 }, (_, i) => {
  const statuses = ["accepted", "reviewed", "draft", "prediction", "rejected"];
  const labels = [
    "text-line",
    "paragraph",
    "header",
    "marginal-note",
    "page-number",
    "signature",
  ];
  const docTypes = ["handwritten", "printed", "map", "form"];

  const docIndex = Math.floor(i / PAGES_PER_DOC);
  const docType = docTypes[docIndex % docTypes.length];
  const label = labels[i % labels.length];

  // Generate deterministic UMAP-like 2D coordinates with cluster structure
  const [cx, cy] = DOC_TYPE_CENTERS[docType] ?? [0, 0];
  const [lx, ly] = LABEL_SUB_OFFSETS[label] ?? [0, 0];
  const angle = i * 2.399; // golden angle for even spread
  const r = 0.3 + (((i * 7 + 13) % 20) / 20) * 1.2;
  const umap_x = cx + lx + r * Math.cos(angle);
  const umap_y = cy + ly + r * Math.sin(angle);

  return {
    page_id: `mock-page-${String(i + 1).padStart(3, "0")}`,
    doc_id: `doc-${docIndex + 1}`,
    page_num: (i % PAGES_PER_DOC) + 1,
    width: 800,
    height: 1100,
    annotation_count: 20 + ((i * 7 + 13) % 61), // deterministic, matches generate-mock-data.ts
    status: statuses[i % statuses.length],
    label: labels[i % labels.length],
    doc_type: docType,
    umap_x: Math.round(umap_x * 1000) / 1000,
    umap_y: Math.round(umap_y * 1000) / 1000,
  };
});

export const GET: RequestHandler = ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const search = url.searchParams.get("q")?.toLowerCase();
  const sort = url.searchParams.get("sort") ?? "page_num";
  const order = url.searchParams.get("order") ?? "asc";

  // Collect all filter params — supports comma-separated multi-select
  const filters: Record<string, string[]> = {};
  for (const col of COLUMNS) {
    const val = url.searchParams.get(col.name);
    if (val) filters[col.name] = val.split(",");
  }

  // Scatter plot selection filter — comma-separated page_ids
  const pageIdFilter = url.searchParams.get("page_ids")?.split(",");

  let pages = [...MOCK_PAGES];

  // Apply page_ids filter (from scatter plot lasso selection)
  if (pageIdFilter && pageIdFilter.length > 0) {
    const idSet = new Set(pageIdFilter);
    pages = pages.filter((p) => idSet.has(p.page_id));
  }

  // Apply search
  if (search) {
    pages = pages.filter(
      (p) =>
        p.page_id.toLowerCase().includes(search) ||
        p.doc_id.toLowerCase().includes(search),
    );
  }

  // Apply filters (multi-select: match any of the selected values)
  for (const [key, vals] of Object.entries(filters)) {
    pages = pages.filter((p) => {
      const v = p[key as keyof typeof p];
      if (typeof v === "number") return vals.some((val) => v === Number(val));
      return vals.includes(String(v));
    });
  }

  // Sort
  pages.sort((a, b) => {
    const av = a[sort as keyof typeof a];
    const bv = b[sort as keyof typeof b];
    const cmp = typeof av === "number"
      ? (av as number) - (bv as number)
      : String(av).localeCompare(String(bv));
    return order === "desc" ? -cmp : cmp;
  });

  const total = pages.length;
  const slice = pages.slice(offset, offset + limit);

  return new Response(
    JSON.stringify({ pages: slice, total, offset, limit, columns: COLUMNS }),
    { headers: { "Content-Type": "application/json" } },
  );
};
