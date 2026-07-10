import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStore, performanceFromCombo, rank } from './localStore'
import { performanceId } from './perfId'
import type { PartId, Performance, Tag, Take } from '../types'

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto })
}

function makeTag(overrides: Partial<Tag> = {}): Tag {
  return {
    tagId: 'tag1', title: 'Lost Chord', creatorUid: 'u1', voicing: 'ttbb',
    parts: ['tenor', 'lead', 'bari', 'bass'], key: 'B♭', durationMs: 20_000,
    createdAt: Date.now(), ...overrides,
  }
}

function makeTake(part: PartId, id: string, uid = `u_${part}`): Take {
  return {
    takeId: id, tagId: 'tag1', uid, displayName: uid, part,
    mediaOffsetMs: 450, nudgeMs: 0, mimeType: 'video/webm', guideTakeIds: [], createdAt: Date.now(),
  }
}

const blob = () => new Blob(['x'], { type: 'video/webm' })

describe('performanceId', () => {
  it('is deterministic regardless of order', async () => {
    const a = await performanceId(['t1', 't2', 't3', 't4'])
    const b = await performanceId(['t4', 't3', 't2', 't1'])
    expect(a).toBe(b)
  })
  it('differs for different combos', async () => {
    const a = await performanceId(['t1', 't2', 't3', 't4'])
    const b = await performanceId(['t1', 't2', 't3', 't5'])
    expect(a).not.toBe(b)
  })
})

describe('performanceFromCombo', () => {
  const tag = makeTag()
  it('returns null while parts remain open', async () => {
    const take = makeTake('bass', 'tb')
    const guides = [makeTake('lead', 'tl')]
    expect(await performanceFromCombo(tag, take, guides)).toBeNull()
  })
  it('creates a performance when the last part lands', async () => {
    const take = makeTake('bass', 'tb', 'jason')
    const guides = [makeTake('tenor', 'tt'), makeTake('lead', 'tl'), makeTake('bari', 'tr')]
    const perf = await performanceFromCombo(tag, take, guides)
    expect(perf).not.toBeNull()
    expect(perf!.completedByUid).toBe('jason')
    expect(perf!.contributorUids).toHaveLength(4)
    expect(Object.keys(perf!.takeIds)).toHaveLength(4)
  })
  it('swap-in creates a DIFFERENT performance id (the Jason case)', async () => {
    const guides = [makeTake('tenor', 'tt'), makeTake('lead', 'tl'), makeTake('bari', 'tr')]
    const original = await performanceFromCombo(tag, makeTake('bass', 'tb1'), guides)
    const swapIn = await performanceFromCombo(tag, makeTake('bass', 'tb2'), guides)
    expect(original!.perfId).not.toBe(swapIn!.perfId)
  })
})

describe('LocalStore', () => {
  let store: LocalStore
  beforeEach(() => {
    indexedDB = new IDBFactory() // fresh db per test (fake-indexeddb)
    store = new LocalStore()
  })

  it('stores and lists tags with takes and media', async () => {
    await store.createTag(makeTag())
    await store.addTake(makeTake('lead', 't1'), blob())
    const takes = await store.listTakes('tag1')
    expect(takes).toHaveLength(1)
    expect(await store.getMedia('t1')).toBeDefined()
  })

  it('duplicate performance creation is a silent no-op', async () => {
    const perf: Performance = {
      perfId: 'p1', tagId: 'tag1', takeIds: { lead: 't1' },
      completedByUid: 'u1', contributorUids: ['u1'], likeCount: 5, createdAt: Date.now(),
    }
    await store.createPerformance(perf)
    await store.createPerformance({ ...perf, likeCount: 0 })
    const all = await store.listPerformances()
    expect(all).toHaveLength(1)
    expect(all[0].likeCount).toBe(5) // first write wins
  })

  it('like toggling is idempotent per user', async () => {
    await store.createPerformance({
      perfId: 'p1', tagId: 'tag1', takeIds: {}, completedByUid: 'u1',
      contributorUids: [], likeCount: 0, createdAt: Date.now(),
    })
    await store.toggleLike('p1', 'me')
    let p = await store.getPerformance('p1')
    expect(p!.likeCount).toBe(1)
    await store.toggleLike('p1', 'me')
    p = await store.getPerformance('p1')
    expect(p!.likeCount).toBe(0)
  })

  it('deleting a take removes its media and performances containing it', async () => {
    await store.addTake(makeTake('bass', 't9'), blob())
    await store.createPerformance({
      perfId: 'px', tagId: 'tag1', takeIds: { bass: 't9' },
      completedByUid: 'u1', contributorUids: ['u1'], likeCount: 0, createdAt: Date.now(),
    })
    await store.createPerformance({
      perfId: 'py', tagId: 'tag1', takeIds: { bass: 'other' },
      completedByUid: 'u1', contributorUids: ['u1'], likeCount: 0, createdAt: Date.now(),
    })
    await store.deleteTake('t9')
    expect(await store.getMedia('t9')).toBeUndefined()
    expect(await store.getTake('t9')).toBeUndefined()
    expect(await store.getPerformance('px')).toBeUndefined()
    expect(await store.getPerformance('py')).toBeDefined() // untouched
  })

  it('deleting a tag cascades to takes, media, and performances', async () => {
    await store.createTag(makeTag())
    await store.addTake(makeTake('lead', 'tl'), blob())
    await store.createPerformance({
      perfId: 'pz', tagId: 'tag1', takeIds: { lead: 'tl' },
      completedByUid: 'u1', contributorUids: ['u1'], likeCount: 0, createdAt: Date.now(),
    })
    await store.deleteTag('tag1')
    expect(await store.getTag('tag1')).toBeUndefined()
    expect(await store.getTake('tl')).toBeUndefined()
    expect(await store.getMedia('tl')).toBeUndefined()
    expect(await store.listPerformances()).toHaveLength(0)
  })
})

describe('rank', () => {
  it('likes beat age, recency beats stale likes', () => {
    const now = Date.now()
    const fresh = { likeCount: 0, createdAt: now } as Performance
    const liked = { likeCount: 10, createdAt: now } as Performance
    const staleLiked = { likeCount: 10, createdAt: now - 14 * 24 * 3_600_000 } as Performance
    expect(rank(liked)).toBeGreaterThan(rank(fresh))
    expect(rank(fresh)).toBeGreaterThan(rank(staleLiked))
  })
})
