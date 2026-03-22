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
] as const;

// Mock page data
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

  return {
    page_id: `mock-page-${String(i + 1).padStart(3, "0")}`,
    doc_id: `doc-${Math.floor(i / 4) + 1}`,
    page_num: (i % 4) + 1,
    width: 800,
    height: 1100,
    annotation_count: Math.floor(Math.random() * 80) + 5,
    status: statuses[i % statuses.length],
    label: labels[i % labels.length],
    doc_type: docTypes[Math.floor(i / 10) % docTypes.length],
  };
});

export const GET: RequestHandler = ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const search = url.searchParams.get("q")?.toLowerCase();
  const sort = url.searchParams.get("sort") ?? "page_num";
  const order = url.searchParams.get("order") ?? "asc";

  // Collect all filter params (any column name as query param)
  const filters: Record<string, string> = {};
  for (const col of COLUMNS) {
    const val = url.searchParams.get(col.name);
    if (val) filters[col.name] = val;
  }

  let pages = [...MOCK_PAGES];

  // Apply search
  if (search) {
    pages = pages.filter(
      (p) =>
        p.page_id.toLowerCase().includes(search) ||
        p.doc_id.toLowerCase().includes(search),
    );
  }

  // Apply filters
  for (const [key, val] of Object.entries(filters)) {
    pages = pages.filter((p) => {
      const v = p[key as keyof typeof p];
      if (typeof v === "number") return v === Number(val);
      return String(v) === val;
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
