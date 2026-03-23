import {
  Binary,
  Field,
  Schema,
  Table,
  tableFromArrays,
  tableToIPC,
  vectorFromArray,
} from "apache-arrow";

const NUM_ROWS = 50;
const STATUSES = ["prediction", "draft", "reviewed", "accepted", "rejected"];
const STATUS_COUNTS = [10, 15, 10, 10, 5];
const LABELS = [
  "text-line",
  "paragraph",
  "header",
  "marginal-note",
  "page-number",
  "signature",
];
const GROUPS = ["line", "block", "marginalia", "header", "uncategorized"];

// Build status array matching counts, then shuffle
const statuses: string[] = [];
for (let s = 0; s < STATUSES.length; s++) {
  for (let j = 0; j < STATUS_COUNTS[s]; j++) {
    statuses.push(STATUSES[s]);
  }
}
for (let i = statuses.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
}

const ids: string[] = [];
const pageIds: string[] = [];
const xs = new Float32Array(NUM_ROWS);
const ys = new Float32Array(NUM_ROWS);
const widths = new Float32Array(NUM_ROWS);
const heights = new Float32Array(NUM_ROWS);
const polygons: (number[] | null)[] = [];
const texts: string[] = [];
const labels: string[] = [];
const confidences = new Float32Array(NUM_ROWS);
const sources: string[] = [];
const reviewers: string[] = [];
const groups: string[] = [];
const metadatas: string[] = [];

for (let i = 0; i < NUM_ROWS; i++) {
  ids.push(`ann-${String(i).padStart(3, "0")}`);
  pageIds.push("mock-page-001");

  // Position within document bounds (800x1100 SVG)
  const x = 80 + Math.random() * 500;
  const y = 120 + Math.random() * 800;
  const w = 50 + Math.random() * 180;
  const h = 15 + Math.random() * 50;

  xs[i] = x;
  ys[i] = y;
  widths[i] = w;
  heights[i] = h;

  // All annotations store polygon points — rect is just a 4-point polygon
  const numVerts = [4, 4, 6, 8][i % 4]; // mix of rect-like and complex polygons
  const verts: number[] = [];
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;

  if (numVerts === 4 && i % 2 === 0) {
    // Axis-aligned rectangle as 4 points
    verts.push(x, y, x + w, y, x + w, y + h, x, y + h);
  } else {
    // General polygon with some jitter
    for (let v = 0; v < numVerts; v++) {
      const angle = (v / numVerts) * Math.PI * 2;
      const jx = (Math.random() - 0.5) * 8;
      const jy = (Math.random() - 0.5) * 8;
      verts.push(cx + rx * Math.cos(angle) + jx);
      verts.push(cy + ry * Math.sin(angle) + jy);
    }
  }
  polygons.push(verts);

  texts.push(`Line ${i + 1}: Sample annotation text`);
  labels.push(LABELS[i % LABELS.length]);
  confidences[i] = 0.3 + Math.random() * 0.69;
  sources.push(i % 3 === 0 ? "manual" : "model:trocr-v2");
  reviewers.push("");
  groups.push(GROUPS[i % GROUPS.length]);
  metadatas.push("{}");
}

const table = tableFromArrays({
  id: ids,
  page_id: pageIds,
  x: xs,
  y: ys,
  width: widths,
  height: heights,
  polygon: polygons,
  text: texts,
  label: labels,
  confidence: confidences,
  source: sources,
  status: statuses,
  reviewer: reviewers,
  group: groups,
  metadata: metadatas,
});

// ── Annotation table (schema metadata for page-level info, no image) ──
const pageMetadata = new Map([
  ["page_id", "mock-page-001"],
  ["document_id", "mock-doc"],
  ["dataset_id", "mock-dataset"],
  ["image_width", "800"],
  ["image_height", "1100"],
  ["source_archive", "Riksarkivet"],
  ["reference_code", "SE/RA/420106/01/H IIIa:1"],
  ["scan_date", "2024-03-15"],
  ["htr_model", "trocr-v2-riksarkivet"],
  ["htr_date", "2025-01-10"],
]);
const schemaWithMeta = new Schema(table.schema.fields, pageMetadata);
const tableWithMeta = new Table(schemaWithMeta, table.batches);

const ipc = tableToIPC(tableWithMeta, "stream");
await Deno.writeFile("static/mock/mock-page-001.arrow", ipc);

// ── Page table (Binary columns for image + thumbnail) ──
const svgBytes = new Uint8Array(
  await Deno.readFile("static/mock/sample-page.svg"),
);

// Build page table with Binary image column
// Arrow JS vectorFromArray with explicit Binary type creates proper zero-copy binary data
const imageVector = vectorFromArray([svgBytes], new Binary());
const thumbVector = vectorFromArray([svgBytes], new Binary());

const scalarTable = tableFromArrays({
  page_id: ["mock-page-001"],
  document_id: ["mock-doc"],
  dataset_id: ["mock-dataset"],
  page_number: new Int32Array([1]),
  image_mime: ["image/svg+xml"],
  image_width: new Int32Array([800]),
  image_height: new Int32Array([1100]),
});

// Combine all columns into page table
const pageTable = new Table({
  page_id: scalarTable.getChild("page_id")!,
  document_id: scalarTable.getChild("document_id")!,
  dataset_id: scalarTable.getChild("dataset_id")!,
  page_number: scalarTable.getChild("page_number")!,
  image: imageVector,
  thumbnail: thumbVector,
  image_mime: scalarTable.getChild("image_mime")!,
  image_width: scalarTable.getChild("image_width")!,
  image_height: scalarTable.getChild("image_height")!,
});
const pageIpc = tableToIPC(pageTable, "stream");
await Deno.writeFile("static/mock/mock-page-001.page.arrow", pageIpc);

console.log(
  `Generated ${NUM_ROWS} annotations → static/mock/mock-page-001.arrow`,
);
console.log(
  `Generated page table → static/mock/mock-page-001.page.arrow (${svgBytes.length} byte image)`,
);
console.log(`  Polygons: 30, Bboxes: 20`);
console.log(
  `  Statuses: ${
    STATUS_COUNTS.map((c, i) => `${STATUSES[i]}=${c}`).join(", ")
  }`,
);
