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
