import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  EMPTY_STATS,
  applyGame,
  averageScore,
  newlyUnlocked,
  unlockedSkins,
  type GameSummary,
  type Stats,
} from '@/progression/achievements'

const game = (over: Partial<GameSummary> = {}): GameSummary => ({
  score: 180,
  won: true,
  yahtzees: 0,
  earnedUpperBonus: false,
  variant: 'standard',
  categoryScores: {},
  ...over,
})

describe('lifetime stats', () => {
  it('accumulates across games', () => {
    let stats = applyGame(EMPTY_STATS, game({ score: 200 }))
    stats = applyGame(stats, game({ score: 150, won: false }))
    expect(stats.gamesPlayed).toBe(2)
    expect(stats.gamesWon).toBe(1)
    expect(stats.bestScore).toBe(200)
    expect(averageScore(stats)).toBe(175)
  })

  it('keeps the best score for each category', () => {
    let stats = applyGame(EMPTY_STATS, game({ categoryScores: { sixes: 18, chance: 20 } }))
    stats = applyGame(stats, game({ categoryScores: { sixes: 12, chance: 26 } }))
    expect(stats.categoryBests.sixes).toBe(18)
    expect(stats.categoryBests.chance).toBe(26)
  })

  it('records a zero as a category best when nothing better exists', () => {
    const stats = applyGame(EMPTY_STATS, game({ categoryScores: { yahtzee: 0 } }))
    expect(stats.categoryBests.yahtzee).toBe(0)
  })

  it('tracks each variant only once', () => {
    let stats = applyGame(EMPTY_STATS, game({ variant: 'standard' }))
    stats = applyGame(stats, game({ variant: 'standard' }))
    stats = applyGame(stats, game({ variant: 'triple' }))
    expect(stats.variantsPlayed).toEqual(['standard', 'triple'])
  })
})

describe('daily streaks', () => {
  it('extends on consecutive days', () => {
    let stats = applyGame(EMPTY_STATS, game({ dailyKey: '2026-03-14' }))
    expect(stats.dailyStreak).toBe(1)
    stats = applyGame(stats, game({ dailyKey: '2026-03-15' }))
    expect(stats.dailyStreak).toBe(2)
    stats = applyGame(stats, game({ dailyKey: '2026-03-16' }))
    expect(stats.dailyStreak).toBe(3)
    expect(stats.bestDailyStreak).toBe(3)
  })

  it('resets after a missed day but remembers the best', () => {
    let stats = applyGame(EMPTY_STATS, game({ dailyKey: '2026-03-14' }))
    stats = applyGame(stats, game({ dailyKey: '2026-03-15' }))
    stats = applyGame(stats, game({ dailyKey: '2026-03-18' }))
    expect(stats.dailyStreak).toBe(1)
    expect(stats.bestDailyStreak).toBe(2)
  })

  it('does not inflate the streak by replaying the same day', () => {
    let stats = applyGame(EMPTY_STATS, game({ dailyKey: '2026-03-14' }))
    stats = applyGame(stats, game({ dailyKey: '2026-03-14' }))
    expect(stats.dailyStreak).toBe(1)
    expect(stats.gamesPlayed).toBe(2)
  })

  it('carries a streak across a month boundary', () => {
    let stats = applyGame(EMPTY_STATS, game({ dailyKey: '2026-01-31' }))
    stats = applyGame(stats, game({ dailyKey: '2026-02-01' }))
    expect(stats.dailyStreak).toBe(2)
  })

  it('carries a streak across a leap day', () => {
    let stats = applyGame(EMPTY_STATS, game({ dailyKey: '2028-02-29' }))
    stats = applyGame(stats, game({ dailyKey: '2028-03-01' }))
    expect(stats.dailyStreak).toBe(2)
  })
})

describe('achievements and rewards', () => {
  it('starts with only the default dice', () => {
    expect(unlockedSkins(EMPTY_STATS)).toEqual(['ivory'])
  })

  it('unlocks a skin when its target is reached', () => {
    const stats: Stats = { ...EMPTY_STATS, gamesPlayed: 5 }
    expect(unlockedSkins(stats)).toContain('midnight')
  })

  it('reports only what this game unlocked', () => {
    const before: Stats = { ...EMPTY_STATS, gamesPlayed: 4, yahtzees: 1 }
    const after = applyGame(before, game())
    const fresh = newlyUnlocked(before, after).map((a) => a.id)
    expect(fresh).toContain('regular')
    expect(fresh).not.toContain('firstYahtzee')
  })

  it('never awards the same achievement twice', () => {
    const before: Stats = { ...EMPTY_STATS, gamesPlayed: 10 }
    const after = applyGame(before, game())
    expect(newlyUnlocked(before, after)).toEqual([])
  })

  it('gives every achievement a reachable target and unique id', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id))
    expect(ids.size).toBe(ACHIEVEMENTS.length)
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.progress(EMPTY_STATS).target).toBeGreaterThan(0)
      expect(achievement.progress(EMPTY_STATS).current).toBe(0)
    }
  })

  it('rewards every dice skin through some achievement', () => {
    const maxed: Stats = {
      ...EMPTY_STATS,
      gamesPlayed: 99, bestScore: 400, yahtzees: 99,
      upperBonuses: 99, bestDailyStreak: 99,
      variantsPlayed: ['standard', 'triple', 'sixDice'],
    }
    expect(unlockedSkins(maxed).sort()).toEqual(
      ['gold', 'ivory', 'jade', 'midnight', 'neon', 'ruby'],
    )
  })
})
