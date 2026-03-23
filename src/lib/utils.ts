import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Re-export type utilities from bits-ui — required by shadcn-svelte components
export type {
  WithElementRef,
  WithoutChild,
  WithoutChildren,
  WithoutChildrenOrChild,
} from "bits-ui";
