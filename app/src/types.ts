export type PartId = 'tenor' | 'lead' | 'bari' | 'bass'
export type Voicing = 'ttbb' | 'ssaa' | 'mixed'

export const PART_ORDER: PartId[] = ['tenor', 'lead', 'bari', 'bass']

export const PART_LABEL: Record<PartId, string> = {
  tenor: 'Tenor', lead: 'Lead', bari: 'Bari', bass: 'Bass',
}

export const PART_COLOR: Record<PartId, string> = {
  tenor: '#8FB7E8', lead: '#E06A5A', bari: '#C79A3D', bass: '#5E8C6E',
}

export const KEYS = ['F', 'F#', 'G', 'A♭', 'A', 'B♭', 'B', 'C', 'D♭', 'D', 'E♭', 'E'] as const
export type Key = (typeof KEYS)[number]

export interface UserProfile {
  uid: string
  displayName: string
  voiceParts: PartId[]
  createdAt: number
}

export interface Tag {
  tagId: string
  title: string
  creatorUid: string
  voicing: Voicing
  parts: PartId[]
  key: Key
  durationMs: number   // master timeline length, set by first take
  createdAt: number
}

export interface Take {
  takeId: string
  tagId: string
  uid: string
  displayName: string
  part: PartId
  /** position of master t=0 (first count-in click) within the media file, ms */
  mediaOffsetMs: number
  /** user nudge applied on top of mediaOffsetMs, ms (positive = play later) */
  nudgeMs: number
  mimeType: string
  guideTakeIds: string[]
  createdAt: number
}

export interface Performance {
  perfId: string
  tagId: string
  takeIds: Partial<Record<PartId, string>>
  completedByUid: string
  contributorUids: string[]
  likeCount: number
  createdAt: number
}
