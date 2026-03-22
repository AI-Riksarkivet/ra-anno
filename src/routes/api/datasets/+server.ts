import type { RequestHandler } from "./$types";

const MOCK_DATASETS = [
  {
    dataset_id: "mock-dataset-001",
    name: "Test Collection",
    doc_type: "handwritten",
    page_count: 1,
  },
];

export const GET: RequestHandler = () => {
  return new Response(JSON.stringify(MOCK_DATASETS), {
    headers: { "Content-Type": "application/json" },
  });
};
