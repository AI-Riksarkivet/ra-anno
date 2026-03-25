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
const DOC_TYPES = ["handwritten", "printed", "map", "form"];

// UMAP cluster centers by doc_type
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

const EMBEDDING_DIM = 128;

// Ensure output directory exists
try {
  await Deno.stat("static/mock");
} catch {
  await Deno.mkdir("static/mock", { recursive: true });
}

// Seeded pseudo-random for deterministic but varied output
function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// Generate a unique SVG per page with "handwriting" scribbles and page-specific text
function generatePageSvg(
  pageId: string,
  docId: string,
  pageNum: number,
  seed: number,
): string {
  const rng = seededRandom(seed);
  const bgTint = Math.floor(rng() * 20) - 10; // slight color variation
  const r = 245 + bgTint;
  const g = 240 + bgTint;
  const b = 232 + Math.floor(bgTint * 0.5);

  // Generate wavy "handwriting" lines
  const textLines: string[] = [];
  const lineCount = 15 + Math.floor(rng() * 15);
  for (let i = 0; i < lineCount; i++) {
    const y = 130 + i * 28 + Math.floor(rng() * 8) - 4;
    const startX = 90 + Math.floor(rng() * 30);
    const endX = 680 - Math.floor(rng() * 100);
    // Wavy path
    let d = `M ${startX} ${y}`;
    for (let x = startX; x < endX; x += 20) {
      const dy = (rng() - 0.5) * 6;
      d += ` Q ${x + 10} ${y + dy}, ${x + 20} ${y + (rng() - 0.5) * 3}`;
    }
    const opacity = 0.3 + rng() * 0.4;
    const width = 0.5 + rng() * 1.5;
    textLines.push(
      `<path d="${d}" fill="none" stroke="#1a1a2e" stroke-width="${
        width.toFixed(1)
      }" opacity="${opacity.toFixed(2)}"/>`,
    );
  }

  // Add some "word" blocks (short horizontal strokes grouped together)
  const wordBlocks: string[] = [];
  for (let i = 0; i < 8 + Math.floor(rng() * 12); i++) {
    const x = 100 + Math.floor(rng() * 500);
    const y = 120 + Math.floor(rng() * 850);
    const wordLen = 30 + Math.floor(rng() * 80);
    const thickness = 1 + rng() * 2;
    wordBlocks.push(
      `<rect x="${x}" y="${y}" width="${wordLen}" height="${
        thickness.toFixed(1)
      }" fill="#1a1a2e" opacity="${
        (0.15 + rng() * 0.3).toFixed(2)
      }" rx="0.5"/>`,
    );
  }

  // Occasional margin notes
  const marginNotes: string[] = [];
  if (rng() > 0.4) {
    const my = 200 + Math.floor(rng() * 600);
    marginNotes.push(
      `<text x="35" y="${my}" font-family="serif" font-size="10" fill="#8b7355" opacity="0.6" transform="rotate(-5, 35, ${my})">${
        rng() > 0.5 ? "NB" : "obs!"
      }</text>`,
    );
  }

  // Occasional stamp or seal
  const stamps: string[] = [];
  if (rng() > 0.7) {
    const sx = 500 + Math.floor(rng() * 150);
    const sy = 900 + Math.floor(rng() * 100);
    stamps.push(
      `<circle cx="${sx}" cy="${sy}" r="25" fill="none" stroke="#8b2020" stroke-width="2" opacity="0.3"/>`,
      `<text x="${sx}" y="${
        sy + 4
      }" text-anchor="middle" font-family="serif" font-size="8" fill="#8b2020" opacity="0.3">SIGILL</text>`,
    );
  }

  // Page number at bottom
  const pageNumPos = rng() > 0.5 ? "right" : "center";
  const pnX = pageNumPos === "right" ? 700 : 400;
  const pnAnchor = pageNumPos === "right" ? "end" : "middle";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1100">
  <rect width="100%" height="100%" fill="rgb(${r},${g},${b})"/>
  <g fill="none" stroke="#2a2a2a" stroke-width="0.5" opacity="0.15">
    ${
    Array.from({ length: 38 }, (_, i) =>
      `<line x1="80" y1="${120 + i * 24}" x2="720" y2="${120 + i * 24}"/>`)
      .join("\n    ")
  }
  </g>
  <rect x="60" y="60" width="680" height="980" fill="none" stroke="#8b7355" stroke-width="1.5" opacity="0.5"/>
  <text x="400" y="95" text-anchor="middle" font-family="serif" font-size="20" fill="#2a2a2a" opacity="0.7">${docId.toUpperCase()} — Sida ${pageNum}</text>
  ${textLines.join("\n  ")}
  ${wordBlocks.join("\n  ")}
  ${marginNotes.join("\n  ")}
  ${stamps.join("\n  ")}
  <text x="${pnX}" y="1060" text-anchor="${pnAnchor}" font-family="serif" font-size="12" fill="#666" opacity="0.5">${pageNum}</text>
</svg>`;
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

  // Generate unique SVG for this page
  const pageSvg = generatePageSvg(pageId, docId, pageNum, p * 12345 + 67890);
  const pageSvgBytes = new TextEncoder().encode(pageSvg);

  // Generate embedding and UMAP coordinates for this page
  const docType = DOC_TYPES[(docIndex - 1) % DOC_TYPES.length];
  const pageLabel = LABELS[p % LABELS.length];
  const [cx, cy] = DOC_TYPE_CENTERS[docType] ?? [0, 0];
  const [lx, ly] = LABEL_SUB_OFFSETS[pageLabel] ?? [0, 0];
  const umapAngle = p * 2.399; // golden angle
  const umapR = 0.3 + (((p * 7 + 13) % 20) / 20) * 1.2;
  const umapX = cx + lx + umapR * Math.cos(umapAngle);
  const umapY = cy + ly + umapR * Math.sin(umapAngle);

  // Generate a deterministic mock embedding vector
  const embeddingRng = seededRandom(p * 31337);
  const embedding = new Float32Array(EMBEDDING_DIM);
  for (let d = 0; d < EMBEDDING_DIM; d++) {
    embedding[d] = (embeddingRng() - 0.5) * 2;
  }

  // Page table with Binary image column
  const imageVector = vectorFromArray([pageSvgBytes], new Binary());
  const thumbVector = vectorFromArray([pageSvgBytes], new Binary());
  const scalarTable = tableFromArrays({
    page_id: [pageId],
    document_id: [docId],
    dataset_id: ["mock-dataset-001"],
    page_number: new Int32Array([pageNum]),
    image_mime: ["image/svg+xml"],
    image_width: new Int32Array([800]),
    image_height: new Int32Array([1100]),
    embedding: [Array.from(embedding)],
    umap_x: new Float32Array([umapX]),
    umap_y: new Float32Array([umapY]),
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
    embedding: scalarTable.getChild("embedding")!,
    umap_x: scalarTable.getChild("umap_x")!,
    umap_y: scalarTable.getChild("umap_y")!,
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
