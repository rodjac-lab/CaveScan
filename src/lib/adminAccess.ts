// Hashed allowlist of admin emails. SHA-256 hex of the normalized (trimmed + lowercased) email.
// Storing hashes instead of plaintext emails means the admin identity is not recoverable from
// the public source / shipped JS bundle. A hash match is a strong equality check, not a security
// boundary — keep sensitive admin-only features behind proper server-side checks (Supabase RLS).
const ADMIN_EMAIL_HASHES: ReadonlySet<string> = new Set([
  '5d807670b09421387072d62908be1c35ca69c7419019cb06c44d68949b1457b5',
])

async function sha256Hex(value: string): Promise<string> {
  const buffer = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

export async function emailIsAdmin(email: string | null | undefined): Promise<boolean> {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const hash = await sha256Hex(normalized)
  return ADMIN_EMAIL_HASHES.has(hash)
}
