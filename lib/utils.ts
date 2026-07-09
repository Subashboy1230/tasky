import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Extract a valid JSON object from an LLM response that may include
 * leading/trailing junk or ```json fences.
 */
export function extractJsonObject(text: string): string {
  const t = text.trim()
  if (!t) return '{}'
  // strip ``` fences
  const fenced = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = fenced ? fenced[1] : t
  // find first { and last }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1) return '{}'
  return body.slice(start, end + 1).trim()
}
