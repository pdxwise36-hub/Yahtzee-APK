import type { CategoryId, VariantId } from '@/engine/types'

/** Lifetime record for one player, persisted between sessions. */
export interface Stats {
  gamesPlayed: number
  gamesWon: number
  bestScore: number
  totalScore: number
  /** Every Yahtzee ever rolled, including bonus ones. */
  yahtzees: number
  upperBonuses: number
  dailyStreak: number
  bestDailyStreak: number
  /** Last daily challenge completed, as YYYY-MM-DD. */
  lastDailyKey: string | null
  categoryBests: Partial<Record<CategoryId, number>>
  variantsPlayed: VariantId[]
}

export const EMPTY_STATS: Stats = {
  gamesPlayed: 0,
  gamesWon: 0,
  bestScore: 0,
  totalScore: 0,
  yahtzees: 0,
  upperBonuses: 0,
  dailyStreak: 0,
  bestDailyStreak: 0,
  lastDailyKey: null,
  categoryBests: {},
  variantsPlayed: [],
}

/** What a finished game contributes to the lifetime record. */
export interface GameSummary {
  score: number
  won: boolean
  yahtzees: number
  earnedUpperBonus: boolean
  variant: VariantId
  categoryScores: Partial<Record<CategoryId, number>>
  /** Set when this game was the daily challenge, as YYYY-MM-DD. */
  dailyKey?: string
}

export type RewardKind = 'diceSkin' | 'badge'

export interface Achievement {
  id: string
  name: string
  description: string
  reward: { kind: RewardKind; id: string }
  /** Progress towards unlocking, as current and target. */
  progress: (stats: Stats) => { current: number; target: number }
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'firstGame',
    name: 'Getting Started',
    description: 'Finish your first game',
    reward: { kind: 'badge', id: 'firstGame' },
    progress: (s) => ({ current: s.gamesPlayed, target: 1 }),
  },
  {
    id: 'regular',
    name: 'Regular',
    description: 'Finish 5 games',
    reward: { kind: 'diceSkin', id: 'midnight' },
    progress: (s) => ({ current: s.gamesPlayed, target: 5 }),
  },
  {
    id: 'firstYahtzee',
    name: 'Five of a Kind',
    description: 'Roll your first Yahtzee',
    reward: { kind: 'badge', id: 'firstYahtzee' },
    progress: (s) => ({ current: s.yahtzees, target: 1 }),
  },
  {
    id: 'highRoller',
    name: 'High Roller',
    description: 'Score 250 or more in a single game',
    reward: { kind: 'diceSkin', id: 'ruby' },
    progress: (s) => ({ current: s.bestScore, target: 250 }),
  },
  {
    id: 'bonusHunter',
    name: 'Bonus Hunter',
    description: 'Earn the upper section bonus 10 times',
    reward: { kind: 'diceSkin', id: 'jade' },
    progress: (s) => ({ current: s.upperBonuses, target: 10 }),
  },
  {
    id: 'yahtzeeMaster',
    name: 'Yahtzee Master',
    description: 'Roll 5 Yahtzees',
    reward: { kind: 'diceSkin', id: 'gold' },
    progress: (s) => ({ current: s.yahtzees, target: 5 }),
  },
  {
    id: 'streaker',
    name: 'Seven Day Streak',
    description: 'Complete the daily challenge 7 days running',
    reward: { kind: 'diceSkin', id: 'neon' },
    progress: (s) => ({ current: s.bestDailyStreak, target: 7 }),
  },
  {
    id: 'contender',
    name: 'Contender',
    description: 'Win 10 games',
    reward: { kind: 'diceSkin', id: 'sapphire' },
    progress: (s) => ({ current: s.gamesWon, target: 10 }),
  },
  {
    id: 'centurion',
    name: 'Three Hundred Club',
    description: 'Score 300 or more in a single game',
    reward: { kind: 'diceSkin', id: 'coral' },
    progress: (s) => ({ current: s.bestScore, target: 300 }),
  },
  {
    id: 'devoted',
    name: 'Devoted',
    description: 'Finish 25 games',
    reward: { kind: 'diceSkin', id: 'amethyst' },
    progress: (s) => ({ current: s.gamesPlayed, target: 25 }),
  },
  {
    id: 'veteran',
    name: 'Veteran',
    description: 'Finish 50 games',
    reward: { kind: 'diceSkin', id: 'silver' },
    progress: (s) => ({ current: s.gamesPlayed, target: 50 }),
  },
  {
    id: 'habit',
    name: 'Making a Habit',
    description: 'Complete the daily challenge 3 days running',
    reward: { kind: 'diceSkin', id: 'bubblegum' },
    progress: (s) => ({ current: s.bestDailyStreak, target: 3 }),
  },
  {
    id: 'collector',
    name: 'Bonus Collector',
    description: 'Earn the upper section bonus 25 times',
    reward: { kind: 'diceSkin', id: 'oak' },
    progress: (s) => ({ current: s.upperBonuses, target: 25 }),
  },
  {
    id: 'completionist',
    name: 'Completionist',
    description: 'Play every game variant',
    reward: { kind: 'badge', id: 'completionist' },
    progress: (s) => ({ current: s.variantsPlayed.length, target: 3 }),
  },
]

export function isUnlocked(achievement: Achievement, stats: Stats): boolean {
  const { current, target } = achievement.progress(stats)
  return current >= target
}

export function unlockedAchievements(stats: Stats): Achievement[] {
  return ACHIEVEMENTS.filter((a) => isUnlocked(a, stats))
}

/** Dice skins the player has earned. Ivory is always available. */
export function unlockedSkins(stats: Stats): string[] {
  const skins = ['ivory']
  for (const achievement of unlockedAchievements(stats)) {
    if (achievement.reward.kind === 'diceSkin') skins.push(achievement.reward.id)
  }
  return skins
}

/** The day before `key`, used to decide whether a daily streak continues. */
function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y as number, (m as number) - 1, d as number)
  date.setDate(date.getDate() - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** Fold a finished game into the lifetime record.
 *
 *  Pure and total: given the same stats and summary it always produces the
 *  same result, which is what lets the achievement popups be derived by
 *  comparing before and after rather than tracked by hand. */
export function applyGame(stats: Stats, summary: GameSummary): Stats {
  const next: Stats = {
    ...stats,
    gamesPlayed: stats.gamesPlayed + 1,
    gamesWon: stats.gamesWon + (summary.won ? 1 : 0),
    bestScore: Math.max(stats.bestScore, summary.score),
    totalScore: stats.totalScore + summary.score,
    yahtzees: stats.yahtzees + summary.yahtzees,
    upperBonuses: stats.upperBonuses + (summary.earnedUpperBonus ? 1 : 0),
    categoryBests: { ...stats.categoryBests },
    variantsPlayed: stats.variantsPlayed.includes(summary.variant)
      ? stats.variantsPlayed
      : [...stats.variantsPlayed, summary.variant],
  }

  for (const [category, score] of Object.entries(summary.categoryScores)) {
    const key = category as CategoryId
    if (score !== undefined && score > (next.categoryBests[key] ?? -1)) {
      next.categoryBests[key] = score
    }
  }

  if (summary.dailyKey) {
    if (stats.lastDailyKey === summary.dailyKey) {
      // Replaying the same day must not inflate the streak.
      return next
    }
    const continues = stats.lastDailyKey === previousDay(summary.dailyKey)
    next.dailyStreak = continues ? stats.dailyStreak + 1 : 1
    next.bestDailyStreak = Math.max(stats.bestDailyStreak, next.dailyStreak)
    next.lastDailyKey = summary.dailyKey
  }

  return next
}

/** Achievements unlocked by this game and not before, for the reward popup. */
export function newlyUnlocked(before: Stats, after: Stats): Achievement[] {
  const had = new Set(unlockedAchievements(before).map((a) => a.id))
  return unlockedAchievements(after).filter((a) => !had.has(a.id))
}

export function averageScore(stats: Stats): number {
  return stats.gamesPlayed === 0 ? 0 : Math.round(stats.totalScore / stats.gamesPlayed)
}
