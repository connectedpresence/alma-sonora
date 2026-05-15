/**
 * Generate a short random ID.
 * Uses crypto.randomUUID if available (Workers runtime), falls back to manual.
 */
export function generateId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback (shouldn't be needed in Workers)
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
