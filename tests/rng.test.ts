import { describe, expect, it } from 'vitest'
import { createRng, dailySeed, dailyKey, hashSeed } from '@/engine/rng'

describe('seeded rng', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRng(42)
    const b = createRng(42)
    const seqA = Array.from({ length: 50 }, () => a.die())
    const seqB = Array.from({ length: 50 }, () => b.die())
    expect(seqA).toEqual(seqB)
  })

  it('resumes from a saved state', () => {
    const rng = createRng(7)
    rng.die()
    rng.die()
    const saved = rng.getState()
    const rest = Array.from({ length: 10 }, () => rng.die())
    const resumed = createRng(0)
    resumed.setState(saved)
    expect(Array.from({ length: 10 }, () => resumed.die())).toEqual(rest)
  })

  it('stays inside die bounds and covers every face', () => {
    const rng = createRng(2024)
    const seen = new Set<number>()
    for (let i = 0; i < 5000; i++) {
      const v = rng.die()
      expect(v).toBeGreaterThanOrEqual(1)
      expect(v).toBeLessThanOrEqual(6)
      seen.add(v)
    }
    expect(seen.size).toBe(6)
  })

  it('is roughly uniform over many rolls', () => {
    const rng = createRng(31337)
    const counts = new Array(7).fill(0)
    const n = 60000
    for (let i = 0; i < n; i++) counts[rng.die()]++
    for (let face = 1; face <= 6; face++) {
      // Expect n/6 = 10000; allow a generous 5% band.
      expect(counts[face]).toBeGreaterThan((n / 6) * 0.95)
      expect(counts[face]).toBeLessThan((n / 6) * 1.05)
    }
  })

  it('gives the same daily seed all day and a new one tomorrow', () => {
    const morning = new Date(2026, 2, 14, 6, 0, 0)
    const night = new Date(2026, 2, 14, 23, 59, 0)
    const tomorrow = new Date(2026, 2, 15, 6, 0, 0)
    expect(dailySeed(morning)).toBe(dailySeed(night))
    expect(dailySeed(morning)).not.toBe(dailySeed(tomorrow))
    expect(dailyKey(morning)).toBe('2026-03-14')
  })

  it('hashes distinct text to distinct seeds', () => {
    expect(hashSeed('a')).not.toBe(hashSeed('b'))
  })
})
