/**
 * In-memory prompt section store.
 * Sections are initialized from default values in prompts.ts.
 * Edits via admin API take effect immediately for new game sessions.
 * Restarts reset to defaults.
 */

export interface PromptSection {
  key: string
  title: string
  content: string
}

// Default sections — populated by prompts.ts on import
const defaults = new Map<string, PromptSection>()
const store = new Map<string, PromptSection>()

export function registerDefault(key: string, title: string, content: string): void {
  const section = { key, title, content }
  defaults.set(key, { ...section })
  if (!store.has(key)) {
    store.set(key, { ...section })
  }
}

export function getSection(key: string): string {
  return store.get(key)?.content ?? defaults.get(key)?.content ?? ''
}

export function getAllSections(): PromptSection[] {
  return Array.from(store.values())
}

export function updateSection(key: string, content: string): boolean {
  const existing = store.get(key)
  if (!existing) return false
  existing.content = content
  return true
}

export function resetAll(): void {
  for (const [key, def] of defaults) {
    store.set(key, { ...def })
  }
}

export function resetSection(key: string): boolean {
  const def = defaults.get(key)
  if (!def) return false
  store.set(key, { ...def })
  return true
}
