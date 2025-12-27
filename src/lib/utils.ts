import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Constructs the public URL for a pipeline.
 * Uses EIFL_PUBLIC_URL environment variable or falls back to the provided default.
 * @param pipelineId - The ID of the pipeline
 * @param fallbackUrl - Optional fallback URL when EIFL_PUBLIC_URL is not set (defaults to http://localhost:3000)
 * @returns The full public URL to the pipeline
 */
export function getPipelineUrl(pipelineId: number, fallbackUrl?: string): string {
  const publicUrl = process.env.EIFL_PUBLIC_URL || fallbackUrl || "http://localhost:3000";
  return `${publicUrl}/pipeline/${pipelineId}`;
}
