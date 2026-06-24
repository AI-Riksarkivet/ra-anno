import { error } from "@sveltejs/kit";

// Page ids are filename segments (e.g. "mock-page-001"). This allowlist forbids
// '.', '/', '\\' and null, so a route param can never traverse out of static/mock.
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/**
 * Validate a route param that is used verbatim as a filesystem name segment.
 * Throws 400 on anything that could escape the intended directory.
 */
export function safePageId(pageId: string): string {
  if (!SAFE_ID.test(pageId)) error(400, `Invalid page id: ${pageId}`);
  return pageId;
}
