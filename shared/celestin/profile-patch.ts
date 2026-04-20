// Deterministic patch application on the compiled profile Markdown.
// Exposed as a shared module so it can be unit-tested from the app side.

export type PatchAction = 'add' | 'edit' | 'remove' | 'no_change'

export type PatchSection =
  | 'profil_gustatif'
  | 'moments_marquants'
  | 'explorations_en_cours'
  | 'style_de_conversation'

export interface ProfilePatch {
  action: PatchAction
  section?: PatchSection
  content?: string
  previous_content?: string
  reason?: string
}

const SECTION_HEADINGS: Record<PatchSection, string> = {
  profil_gustatif: '## Profil gustatif',
  moments_marquants: '## Moments marquants',
  explorations_en_cours: '## Explorations en cours',
  style_de_conversation: '## Style de conversation',
}

const SECTION_ORDER: PatchSection[] = [
  'profil_gustatif',
  'moments_marquants',
  'explorations_en_cours',
  'style_de_conversation',
]

interface ParsedSection {
  key: PatchSection
  heading: string
  lines: string[]
}

function parseMarkdown(markdown: string): ParsedSection[] {
  const lines = markdown.split('\n')
  const sections: ParsedSection[] = SECTION_ORDER.map((key) => ({
    key,
    heading: SECTION_HEADINGS[key],
    lines: [],
  }))

  let current: ParsedSection | null = null
  for (const line of lines) {
    const trimmed = line.trim()
    const matched = sections.find((section) => section.heading === trimmed)
    if (matched) {
      current = matched
      continue
    }
    if (current) current.lines.push(line)
  }

  for (const section of sections) {
    while (section.lines.length > 0 && section.lines[0].trim() === '') section.lines.shift()
    while (section.lines.length > 0 && section.lines[section.lines.length - 1].trim() === '') {
      section.lines.pop()
    }
  }

  return sections
}

function serializeMarkdown(sections: ParsedSection[]): string {
  const chunks: string[] = []
  for (const section of sections) {
    chunks.push(section.heading)
    if (section.lines.length > 0) chunks.push(...section.lines)
    chunks.push('')
  }
  return chunks.join('\n').trim()
}

function normalizeBullet(line: string): string {
  return line.trim().replace(/^[-*]\s*/, '').trim()
}

export function applyPatchToMarkdown(
  markdown: string,
  patch: ProfilePatch,
): { markdown: string; changed: boolean; error?: string } {
  if (patch.action === 'no_change') {
    return { markdown, changed: false }
  }

  if (!patch.section) {
    return { markdown, changed: false, error: 'Missing section' }
  }

  const sections = parseMarkdown(markdown)
  const target = sections.find((section) => section.key === patch.section)
  if (!target) {
    return { markdown, changed: false, error: `Unknown section: ${patch.section}` }
  }

  if (patch.action === 'add') {
    const content = (patch.content ?? '').trim()
    if (!content) return { markdown, changed: false, error: 'Missing content for add' }

    const bullet = content.startsWith('-') || content.startsWith('*') ? content : `- ${content}`
    const alreadyPresent = target.lines.some(
      (line) => normalizeBullet(line) === normalizeBullet(bullet),
    )
    if (alreadyPresent) return { markdown, changed: false, error: 'Duplicate bullet' }

    target.lines.push(bullet)
    return { markdown: serializeMarkdown(sections), changed: true }
  }

  if (patch.action === 'edit') {
    const previous = (patch.previous_content ?? '').trim()
    const next = (patch.content ?? '').trim()
    if (!previous || !next) return { markdown, changed: false, error: 'Missing content for edit' }

    const index = target.lines.findIndex(
      (line) => normalizeBullet(line) === normalizeBullet(previous),
    )
    if (index === -1) return { markdown, changed: false, error: 'Previous bullet not found' }

    const bullet = next.startsWith('-') || next.startsWith('*') ? next : `- ${next}`
    target.lines[index] = bullet
    return { markdown: serializeMarkdown(sections), changed: true }
  }

  if (patch.action === 'remove') {
    const previous = (patch.previous_content ?? patch.content ?? '').trim()
    if (!previous) return { markdown, changed: false, error: 'Missing content for remove' }

    const index = target.lines.findIndex(
      (line) => normalizeBullet(line) === normalizeBullet(previous),
    )
    if (index === -1) return { markdown, changed: false, error: 'Bullet to remove not found' }

    target.lines.splice(index, 1)
    return { markdown: serializeMarkdown(sections), changed: true }
  }

  return { markdown, changed: false, error: `Unknown action: ${patch.action}` }
}

export function countBulletsInSection(markdown: string, section: PatchSection): number {
  const parsed = parseMarkdown(markdown)
  const target = parsed.find((s) => s.key === section)
  if (!target) return 0
  return target.lines.filter((line) => line.trim().startsWith('-') || line.trim().startsWith('*')).length
}
