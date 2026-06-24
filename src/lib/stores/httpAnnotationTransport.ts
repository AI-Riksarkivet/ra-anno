import type {
  AnnotationLoadResult,
  AnnotationSaveContext,
  AnnotationSaveResult,
  AnnotationTransport,
} from "$lib/engine/store/transport.js";
import { AnnotationConflictError } from "$lib/engine/store/transport.js";

/**
 * HTTP transport for the SvelteKit app — talks to /api/annotations/[pageId].
 * This is the host-specific glue that used to be hardcoded inside the engine
 * store; the engine now just calls `transport.load/save`.
 */
export function httpAnnotationTransport(
  baseUrl = "/api/annotations",
): AnnotationTransport {
  const url = (pageId: string) => `${baseUrl}/${encodeURIComponent(pageId)}`;

  return {
    async load(pageId: string): Promise<AnnotationLoadResult | null> {
      const res = await fetch(url(pageId));
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Load failed: ${res.status}`);
      return {
        stream: res.body,
        bytes: null,
        etag: res.headers.get("ETag") ?? "",
      };
    },

    async save(
      pageId: string,
      ipc: Uint8Array,
      ctx: AnnotationSaveContext,
    ): Promise<AnnotationSaveResult> {
      const headers: Record<string, string> = {
        "Content-Type": "application/vnd.apache.arrow.stream",
      };
      if (ctx.ifMatch) headers["If-Match"] = ctx.ifMatch;
      // NOTE: large deletion sets can overflow header limits — a future transport
      // can move these into the body without touching the engine (see task #9).
      if (ctx.deletedIds.length > 0) {
        headers["X-Deleted-Ids"] = ctx.deletedIds.join(",");
      }

      const res = await fetch(url(pageId), {
        method: ctx.method,
        headers,
        body: ipc as unknown as BodyInit,
      });

      if (res.status === 409) throw new AnnotationConflictError();
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);

      return {
        bytes: new Uint8Array(await res.arrayBuffer()),
        etag: res.headers.get("ETag") ?? "",
      };
    },
  };
}
