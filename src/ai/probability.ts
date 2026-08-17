import type { DieValue } from '@/engine/types'

/** A hand is order-independent, so every calculation works on sorted values
 *  keyed as a string. That collapses 7776 orderings of five dice into 252
 *  distinct hands and makes memoising the search practical. */
export type HandKey = string

export function handKey(values: readonly number[]): HandKey {
  return [...values].sort((a, b) => a - b).join('')
}

const parseCache = new Map<HandKey, DieValue[]>()

/** Parsing is on the hottest path of the search, so results are shared. Hands
 *  are immutable by convention, which is what makes the sharing safe. */
export function parseHand(key: HandKey): DieValue[] {
  const cached = parseCache.get(key)
  if (cached) return cached
  const values = [...key].map((c) => Number(c) as DieValue)
  parseCache.set(key, values)
  return values
}

/** Every distinct subset of the hand the player could keep, as sorted value
 *  arrays. Duplicate faces make many subsets identical, so they are collapsed:
 *  keeping "the first 3" and "the second 3" is the same decision. */
const keepCache = new Map<HandKey, number[][]>()

export function keepOptions(values: readonly number[]): number[][] {
  const cacheKey = handKey(values)
  const cached = keepCache.get(cacheKey)
  if (cached) return cached
  const sorted = [...values].sort((a, b) => a - b)
  const seen = new Set<string>()
  const options: number[][] = []

  for (let mask = 0; mask < 1 << sorted.length; mask++) {
    const kept: number[] = []
    for (let i = 0; i < sorted.length; i++) {
      if (mask & (1 << i)) kept.push(sorted[i] as number)
    }
    const key = kept.join('')
    if (seen.has(key)) continue
    seen.add(key)
    options.push(kept)
  }

  keepCache.set(cacheKey, options)
  return options
}

/** All multisets of `count` dice, with the probability of each. */
const outcomeCache = new Map<number, { values: number[]; probability: number }[]>()

export function rollOutcomes(count: number): { values: number[]; probability: number }[] {
  const cached = outcomeCache.get(count)
  if (cached) return cached

  const results: { values: number[]; probability: number }[] = []
  const total = Math.pow(6, count)
  const current: number[] = []

  // Walk faces in non-decreasing order to generate each multiset once, then
  // weight it by how many orderings produce it.
  const walk = (face: number, remaining: number): void => {
    if (remaining === 0) {
      results.push({ values: [...current], probability: arrangements(current) / total })
      return
    }
    for (let f = face; f <= 6; f++) {
      current.push(f)
      walk(f, remaining - 1)
      current.pop()
    }
  }
  walk(1, count)

  outcomeCache.set(count, results)
  return results
}

/** The multinomial coefficient: how many orderings yield this multiset. */
function arrangements(values: readonly number[]): number {
  const counts = new Map<number, number>()
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1)
  let result = factorial(values.length)
  for (const c of counts.values()) result /= factorial(c)
  return result
}

const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040]
function factorial(n: number): number {
  return FACTORIALS[n] ?? 1
}

/** Distribution over final hands after keeping `kept` and rerolling the rest. */
const distributionCache = new Map<string, Map<HandKey, number>>()

/** Cached across turns and games: the odds of a reroll are a property of the
 *  dice, not of the scorecard, so this table is built once and reused. */
export function rerollDistribution(
  kept: readonly number[],
  handSize: number,
): Map<HandKey, number> {
  const cacheKey = `${handSize}:${kept.join('')}`
  const cachedDistribution = distributionCache.get(cacheKey)
  if (cachedDistribution) return cachedDistribution

  const distribution = new Map<HandKey, number>()
  for (const outcome of rollOutcomes(handSize - kept.length)) {
    const key = handKey([...kept, ...outcome.values])
    distribution.set(key, (distribution.get(key) ?? 0) + outcome.probability)
  }
  distributionCache.set(cacheKey, distribution)
  return distribution
}

/* ------------------------------------------------------------------ *
 * Indexed tables
 *
 * The search runs over every possible hand many times per turn, so the
 * string-keyed maps above are compiled once into flat typed arrays. Hands
 * become integer indices and a keep decision becomes a pair of parallel
 * arrays, which turns the inner loop into simple array reads.
 * ------------------------------------------------------------------ */

const handsCache = new Map<number, DieValue[][]>()
const handIndexCache = new Map<number, Map<HandKey, number>>()

/** Every distinct hand of `size` dice, in a stable order. */
export function handsOfSize(size: number): DieValue[][] {
  const cached = handsCache.get(size)
  if (cached) return cached
  const hands = rollOutcomes(size).map((o) => o.values as DieValue[])
  handsCache.set(size, hands)
  const index = new Map<HandKey, number>()
  hands.forEach((hand, i) => index.set(handKey(hand), i))
  handIndexCache.set(size, index)
  return hands
}

export function handIndex(size: number, key: HandKey): number {
  handsOfSize(size)
  return handIndexCache.get(size)?.get(key) ?? -1
}

export interface KeepDistribution {
  kept: number[]
  /** Indices of the hands this keep can lead to. */
  hands: Int32Array
  /** Probability of each, parallel to `hands`. */
  probabilities: Float64Array
}

const keepDistributionCache = new Map<string, KeepDistribution[]>()

/** Each way to keep dice from this hand, with the full outcome distribution
 *  of the resulting reroll, precompiled to typed arrays. */
export function keepDistributions(size: number, hand: readonly number[]): KeepDistribution[] {
  const cacheKey = `${size}:${handKey(hand)}`
  const cached = keepDistributionCache.get(cacheKey)
  if (cached) return cached

  const result: KeepDistribution[] = keepOptions(hand).map((kept) => {
    const distribution = rerollDistribution(kept, size)
    const hands = new Int32Array(distribution.size)
    const probabilities = new Float64Array(distribution.size)
    let i = 0
    for (const [key, probability] of distribution) {
      hands[i] = handIndex(size, key)
      probabilities[i] = probability
      i++
    }
    return { kept, hands, probabilities }
  })

  keepDistributionCache.set(cacheKey, result)
  return result
}
