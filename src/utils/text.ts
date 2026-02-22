export function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

export function normalizeDisplayText(input: unknown): string {
  return stripHtmlTags(String(input ?? '')).trim();
}
