import { openDB, type IDBPDatabase } from 'idb'
import type { PartId, Performance, Tag, Take, UserProfile } from '../types'
import { performanceId } from './perfId'

/**
 * Local-first DataStore backed by IndexedDB. Implements the same shapes the
 * Firebase backend will (docs/04); swapping in a remote store later means
 * implementing this interface against Firestore + R2.
 */
export interface DataStore {
  getProfile(): Promise<UserProfile | null>
  saveProfile(p: UserProfile): Promise<void>
  createTag(tag: Tag): Promise<void>
  getTag(tagId: string): Promise<Tag | undefined>
  listTags(): Promise<Tag[]>
  addTake(take: Take, media: Blob, stem?: Blob): Promise<void>
  updateTakeNudge(takeId: string, nudgeMs: number): Promise<void>
  /** Removes the take, its media, and any performances containing it. */
  deleteTake(takeId: string): Promise<void>
  /** Removes the tag and everything under it: takes, media, performances. */
  deleteTag(tagId: string): Promise<void>
  listTakes(tagId: string): Promise<Take[]>
  getTake(takeId: string): Promise<Take | undefined>
  getMedia(takeId: string): Promise<Blob | undefined>
  /** WAV audio stem (sample 0 == master t=0), if the take has one */
  getStem(takeId: string): Promise<Blob | undefined>
  createPerformance(perf: Performance): Promise<void>
  listPerformances(tagId?: string): Promise<Performance[]>
  getPerformance(perfId: string): Promise<Performance | undefined>
  toggleLike(perfId: string, uid: string): Promise<Performance | undefined>
}

const DB_NAME = 'tagalong-v1'

/** Stems live in the media store beside the video, under a suffixed key. */
function stemKey(takeId: string): string {
  return `${takeId}:stem`
}

function open(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('profile', { keyPath: 'uid' })
      db.createObjectStore('tags', { keyPath: 'tagId' })
      const takes = db.createObjectStore('takes', { keyPath: 'takeId' })
      takes.createIndex('byTag', 'tagId')
      db.createObjectStore('media', { keyPath: 'takeId' })
      const perfs = db.createObjectStore('performances', { keyPath: 'perfId' })
      perfs.createIndex('byTag', 'tagId')
      db.createObjectStore('likes', { keyPath: 'id' })
    },
  })
}

export class LocalStore implements DataStore {
  private dbp: Promise<IDBPDatabase>
  constructor() {
    this.dbp = open()
  }

  async getProfile(): Promise<UserProfile | null> {
    const db = await this.dbp
    const all = await db.getAll('profile')
    return (all[0] as UserProfile) ?? null
  }

  async saveProfile(p: UserProfile): Promise<void> {
    const db = await this.dbp
    await db.put('profile', p)
  }

  async createTag(tag: Tag): Promise<void> {
    const db = await this.dbp
    await db.put('tags', tag)
  }

  async getTag(tagId: string): Promise<Tag | undefined> {
    const db = await this.dbp
    return db.get('tags', tagId)
  }

  async listTags(): Promise<Tag[]> {
    const db = await this.dbp
    const tags = (await db.getAll('tags')) as Tag[]
    return tags.sort((a, b) => b.createdAt - a.createdAt)
  }

  async addTake(take: Take, media: Blob, stem?: Blob): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction(['takes', 'media'], 'readwrite')
    await tx.objectStore('takes').put(take)
    await tx.objectStore('media').put({ takeId: take.takeId, blob: media })
    if (stem) await tx.objectStore('media').put({ takeId: stemKey(take.takeId), blob: stem })
    await tx.done
  }

  async updateTakeNudge(takeId: string, nudgeMs: number): Promise<void> {
    const db = await this.dbp
    const take = (await db.get('takes', takeId)) as Take | undefined
    if (take) await db.put('takes', { ...take, nudgeMs })
  }

  async deleteTake(takeId: string): Promise<void> {
    const db = await this.dbp
    const tx = db.transaction(['takes', 'media', 'performances'], 'readwrite')
    await tx.objectStore('takes').delete(takeId)
    await tx.objectStore('media').delete(takeId)
    await tx.objectStore('media').delete(stemKey(takeId))
    const perfs = (await tx.objectStore('performances').getAll()) as Performance[]
    for (const p of perfs) {
      if (Object.values(p.takeIds).includes(takeId)) {
        await tx.objectStore('performances').delete(p.perfId)
      }
    }
    await tx.done
  }

  async deleteTag(tagId: string): Promise<void> {
    const db = await this.dbp
    const takes = (await db.getAllFromIndex('takes', 'byTag', tagId)) as Take[]
    const perfs = (await db.getAllFromIndex('performances', 'byTag', tagId)) as Performance[]
    const tx = db.transaction(['tags', 'takes', 'media', 'performances'], 'readwrite')
    await tx.objectStore('tags').delete(tagId)
    for (const t of takes) {
      await tx.objectStore('takes').delete(t.takeId)
      await tx.objectStore('media').delete(t.takeId)
      await tx.objectStore('media').delete(stemKey(t.takeId))
    }
    for (const p of perfs) await tx.objectStore('performances').delete(p.perfId)
    await tx.done
  }

  async listTakes(tagId: string): Promise<Take[]> {
    const db = await this.dbp
    const takes = (await db.getAllFromIndex('takes', 'byTag', tagId)) as Take[]
    return takes.sort((a, b) => a.createdAt - b.createdAt)
  }

  async getTake(takeId: string): Promise<Take | undefined> {
    const db = await this.dbp
    return db.get('takes', takeId)
  }

  async getMedia(takeId: string): Promise<Blob | undefined> {
    const db = await this.dbp
    const row = await db.get('media', takeId)
    return row?.blob
  }

  async getStem(takeId: string): Promise<Blob | undefined> {
    const db = await this.dbp
    const row = await db.get('media', stemKey(takeId))
    return row?.blob
  }

  async createPerformance(perf: Performance): Promise<void> {
    const db = await this.dbp
    const existing = await db.get('performances', perf.perfId)
    if (existing) return // same combination already completed — not an error
    await db.put('performances', perf)
  }

  async listPerformances(tagId?: string): Promise<Performance[]> {
    const db = await this.dbp
    const perfs = (
      tagId
        ? await db.getAllFromIndex('performances', 'byTag', tagId)
        : await db.getAll('performances')
    ) as Performance[]
    return perfs.sort((a, b) => rank(b) - rank(a))
  }

  async getPerformance(perfId: string): Promise<Performance | undefined> {
    const db = await this.dbp
    return db.get('performances', perfId)
  }

  async toggleLike(perfId: string, uid: string): Promise<Performance | undefined> {
    const db = await this.dbp
    const likeId = `${uid}_${perfId}`
    const tx = db.transaction(['likes', 'performances'], 'readwrite')
    const perf = (await tx.objectStore('performances').get(perfId)) as Performance | undefined
    if (!perf) return undefined
    const existing = await tx.objectStore('likes').get(likeId)
    let likeCount = perf.likeCount
    if (existing) {
      await tx.objectStore('likes').delete(likeId)
      likeCount = Math.max(0, likeCount - 1)
    } else {
      await tx.objectStore('likes').put({ id: likeId, uid, perfId })
      likeCount += 1
    }
    const updated = { ...perf, likeCount }
    await tx.objectStore('performances').put(updated)
    await tx.done
    return updated
  }
}

/** Feed ranking v1: like-rate with recency decay (doc 04, M3-28). */
export function rank(p: Performance): number {
  const ageHours = (Date.now() - p.createdAt) / 3_600_000
  return (p.likeCount + 1) / Math.pow(ageHours + 2, 1.4)
}

/** Build the performance that would result from adding `newTake` to its guide combo, or null if parts remain open. */
export async function performanceFromCombo(
  tag: Tag,
  newTake: Take,
  guides: Take[],
): Promise<Performance | null> {
  const takeIds: Partial<Record<PartId, string>> = { [newTake.part]: newTake.takeId }
  const uids = new Set<string>([newTake.uid])
  for (const g of guides) {
    takeIds[g.part] = g.takeId
    uids.add(g.uid)
  }
  for (const part of tag.parts) if (!takeIds[part]) return null
  return {
    perfId: await performanceId(Object.values(takeIds) as string[]),
    tagId: tag.tagId,
    takeIds,
    completedByUid: newTake.uid,
    contributorUids: [...uids],
    likeCount: 0,
    createdAt: Date.now(),
  }
}
