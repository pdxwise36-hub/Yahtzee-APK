import type { DieValue } from './types'

/** A deterministic, serialisable random source.
 *
 *  Every roll in the game goes through one of these. Seeding it means a daily
 *  challenge can hand every player the identical sequence of rolls, and a
 *  replay or a desync check can reproduce a game exactly from its seed. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number
  die(): DieValue
  /** Current internal state, so a game in progress can be saved and resumed. */
  getState(): number
  setState(state: number): void
}

/** mulberry32 — small, fast, and good enough statistically for dice.
 *  Deterministic across platforms because it stays inside uint32 arithmetic. */
export function createRng(seed: number): Rng {
  let state = seed >>> 0

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    die: () => (1 + Math.floor(next() * 6)) as DieValue,
    getState: () => state,
    setState: (s) => {
      state = s >>> 0
    },
  }
}

/** Seed from arbitrary text (FNV-1a). Used to turn a date into a daily seed. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** The seed for a given calendar day, so every player's daily challenge matches.
 *  Uses local date parts, so "today's puzzle" follows the player's own midnight. */
export function dailySeed(date: Date = new Date()): number {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return hashSeed(`yahtzee-daily-${y}-${m}-${d}`)
}

export function dailyKey(date: Date = new Date()): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** A non-deterministic seed for ordinary games. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}
