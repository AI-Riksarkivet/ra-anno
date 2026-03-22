import type { AnnotationStatus } from "$lib/types/schemas.js";

export const STATUS_COLORS: Record<AnnotationStatus, number> = {
  accepted: 0x22c55e, // green
  rejected: 0xef4444, // red
  reviewed: 0x3b82f6, // blue
  draft: 0xf59e0b, // amber
  prediction: 0x8b5cf6, // purple
};

export function statusColor(status: string): number {
  return (
    STATUS_COLORS[status as AnnotationStatus] ?? STATUS_COLORS.prediction
  );
}
