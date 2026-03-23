import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

const MOCK_DIR = "static/mock";

/** GET: return page table (Binary columns for image + thumbnail) */
export const GET: RequestHandler = async ({ params }) => {
  const path = `${MOCK_DIR}/${params.pageId}.page.arrow`;

  let ipc: Uint8Array;
  try {
    ipc = await Deno.readFile(path);
  } catch {
    error(404, `No page data for: ${params.pageId}`);
  }

  return new Response(ipc as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/vnd.apache.arrow.stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
};
