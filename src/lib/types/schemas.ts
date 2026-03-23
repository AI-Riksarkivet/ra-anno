// Arrow schema definitions — shared between server and client

export const ANNOTATION_COLUMNS = [
  "id",
  "page_id",
  "dataset_id",
  "x",
  "y",
  "width",
  "height",
  "polygon",
  "text",
  "label",
  "confidence",
  "source",
  "status",
  "reviewer",
  "group",
  "metadata",
] as const;

export type AnnotationStatus =
  | "prediction"
  | "draft"
  | "reviewed"
  | "accepted"
  | "rejected";

export type AnnotationSource = "manual" | `model:${string}`;

/** Page-level table — one row per page, Binary columns for images */
export const PAGE_COLUMNS = [
  "page_id",
  "document_id",
  "dataset_id",
  "page_number",
  "image", // Binary — full resolution page image (JPEG/PNG/SVG)
  "thumbnail", // Binary — small preview (WebP/JPEG)
  "image_mime", // Utf8 — MIME type for the image
  "image_width",
  "image_height",
] as const;
