import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MOCK_DIR = "static/mock";

const IMAGE_MAP: Record<string, { file: string; mime: string }> = {
  "mock-page-001": { file: "sample-page.svg", mime: "image/svg+xml" },
};

export const GET: RequestHandler = async ({ params }) => {
  const entry = IMAGE_MAP[params.pageId];
  if (!entry) {
    error(404, `No image for page: ${params.pageId}`);
  }

  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(`${MOCK_DIR}/${entry.file}`);
  } catch {
    error(404, `Image file not found: ${entry.file}`);
  }

  return new Response(bytes, {
    headers: {
      "Content-Type": entry.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
