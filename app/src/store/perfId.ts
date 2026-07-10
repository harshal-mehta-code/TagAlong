/**
 * Deterministic performance id = SHA-256 of the sorted take ids (doc 04).
 * The same combination of takes always hashes to the same id, making
 * duplicate performances structurally impossible.
 */
export async function performanceId(takeIds: string[]): Promise<string> {
  const canonical = [...takeIds].sort().join('|')
  const data = new TextEncoder().encode(canonical)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function newId(prefix: string): string {
  const rand = crypto.getRandomValues(new Uint32Array(2))
  return `${prefix}_${Date.now().toString(36)}${rand[0].toString(36)}${rand[1].toString(36)}`
}
