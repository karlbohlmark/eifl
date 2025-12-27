import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days !== 1 ? 's' : ''} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months !== 1 ? 's' : ''} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years !== 1 ? 's' : ''} ago`;
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
