import {
  Binary,
  Schema,
  Table,
  tableFromArrays,
  tableToIPC,
  vectorFromArray,
} from "apache-arrow";

const TOTAL_PAGES = 120;
const PAGES_PER_DOC = 24;
const STATUSES = ["prediction", "draft", "reviewed", "accepted", "rejected"];
const LABELS = [
  "text-line",
  "paragraph",
  "header",
  "marginal-note",
  "page-number",
  "signature",
];
const GROUPS = ["line", "block", "marginalia", "header", "uncategorized"];

// Read the SVG image once — shared by all pages
const svgBytes = new Uint8Array(
  await Deno.readFile("static/mock/sample-page.svg"),
);

// Ensure output directory exists
try {
  await Deno.stat("static/mock");
} catch {
  await Deno.mkdir("static/mock", { recursive: true });
}

let totalAnnotations = 0;

for (let p = 0; p < TOTAL_PAGES; p++) {
  const pageNum = (p % PAGES_PER_DOC) + 1;
  const docIndex = Math.floor(p / PAGES_PER_DOC) + 1;
  const pageId = `mock-page-${String(p + 1).padStart(3, "0")}`;
  const docId = `doc-${docIndex}`;

  // Vary annotation count per page (20-80)
  const seed = (p * 7 + 13) % 61;
  const numRows = 20 + seed;

  // Build annotation data for this page
  const ids: string[] = [];
  const pageIds: string[] = [];
  const xs = new Float32Array(numRows);
  const ys = new Float32Array(numRows);
  const widths = new Float32Array(numRows);
  const heights = new Float32Array(numRows);
  const polygons: (number[] | null)[] = [];
  const texts: string[] = [];
  const labels: string[] = [];
  const confidences = new Float32Array(numRows);
  const sources: string[] = [];
  const reviewers: string[] = [];
  const groups: string[] = [];
  const metadatas: string[] = [];
  const statuses: string[] = [];

  for (let i = 0; i < numRows; i++) {
    ids.push(`${pageId}-ann-${String(i).padStart(3, "0")}`);
    pageIds.push(pageId);

    const x = 80 + ((i * 37 + p * 13) % 500);
    const y = 80 + ((i * 53 + p * 7) % 900);
    const w = 50 + ((i * 19 + p * 11) % 180);
    const h = 15 + ((i * 23 + p * 3) % 50);

    xs[i] = x;
    ys[i] = y;
    widths[i] = w;
    heights[i] = h;

    // Polygon vertices
    const numVerts = [4, 4, 6, 8][i % 4];
    const verts: number[] = [];
    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2;
    const ry = h / 2;

    if (numVerts === 4 && i % 2 === 0) {
      verts.push(x, y, x + w, y, x + w, y + h, x, y + h);
    } else {
      for (let v = 0; v < numVerts; v++) {
        const angle = (v / numVerts) * Math.PI * 2;
        const jx = ((i * 17 + v * 31) % 16) - 8;
        const jy = ((i * 23 + v * 37) % 16) - 8;
        verts.push(cx + rx * Math.cos(angle) + jx);
        verts.push(cy + ry * Math.sin(angle) + jy);
      }
    }
    polygons.push(verts);

    texts.push(`Line ${i + 1}: Text from ${docId} page ${pageNum}`);
    labels.push(LABELS[i % LABELS.length]);
    confidences[i] = 0.3 + ((i * 41 + p * 17) % 70) / 100;
    sources.push(i % 3 === 0 ? "manual" : "model:trocr-v2");
    statuses.push(STATUSES[(i + p) % STATUSES.length]);
    reviewers.push("");
    groups.push(GROUPS[i % GROUPS.length]);
    metadatas.push("{}");
  }

  const annTable = tableFromArrays({
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

  // Add schema metadata
  const meta = new Map([
    ["page_id", pageId],
    ["document_id", docId],
    ["dataset_id", "mock-dataset-001"],
    ["image_width", "800"],
    ["image_height", "1100"],
    ["source_archive", "Riksarkivet"],
    ["reference_code", `SE/RA/420106/01/H IIIa:${docIndex}`],
    ["scan_date", "2024-03-15"],
    ["htr_model", "trocr-v2-riksarkivet"],
    ["htr_date", "2025-01-10"],
  ]);
  const schemaWithMeta = new Schema(annTable.schema.fields, meta);
  const tableWithMeta = new Table(schemaWithMeta, annTable.batches);

  await Deno.writeFile(
    `static/mock/${pageId}.arrow`,
    tableToIPC(tableWithMeta, "stream"),
  );

  // Page table with Binary image column
  const imageVector = vectorFromArray([svgBytes], new Binary());
  const thumbVector = vectorFromArray([svgBytes], new Binary());
  const scalarTable = tableFromArrays({
    page_id: [pageId],
    document_id: [docId],
    dataset_id: ["mock-dataset-001"],
    page_number: new Int32Array([pageNum]),
    image_mime: ["image/svg+xml"],
    image_width: new Int32Array([800]),
    image_height: new Int32Array([1100]),
  });
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
  await Deno.writeFile(
    `static/mock/${pageId}.page.arrow`,
    tableToIPC(pageTable, "stream"),
  );

  totalAnnotations += numRows;
}

console.log(
  `Generated ${TOTAL_PAGES} pages → static/mock/mock-page-*.arrow`,
);
console.log(`  Total annotations: ${totalAnnotations}`);
console.log(
  `  Pages per document: ${PAGES_PER_DOC}, Documents: ${
    TOTAL_PAGES / PAGES_PER_DOC
  }`,
);
