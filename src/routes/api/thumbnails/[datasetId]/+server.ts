import type { RequestHandler } from "./$types";

// Mock thumbnail data — in production this would query Lance pages table
const MOCK_PAGES = Array.from({ length: 24 }, (_, i) => ({
  page_id: `mock-page-${String(i + 1).padStart(3, "0")}`,
  doc_id: `doc-${Math.floor(i / 4) + 1}`,
  page_num: (i % 4) + 1,
  width: 800,
  height: 1100,
  annotation_count: Math.floor(Math.random() * 80) + 5,
  status_counts: {
    accepted: Math.floor(Math.random() * 20),
    reviewed: Math.floor(Math.random() * 15),
    draft: Math.floor(Math.random() * 25),
    prediction: Math.floor(Math.random() * 30),
    rejected: Math.floor(Math.random() * 5),
  },
}));

export const GET: RequestHandler = async ({ url }) => {
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  const status = url.searchParams.get("status");

  let pages = MOCK_PAGES;

  // Filter by status if provided
  if (status) {
    pages = pages.filter((p) =>
      p.status_counts[status as keyof typeof p.status_counts] > 0
    );
  }

  const slice = pages.slice(offset, offset + limit);

  return new Response(
    JSON.stringify({
      pages: slice,
      total: pages.length,
      offset,
      limit,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
};
