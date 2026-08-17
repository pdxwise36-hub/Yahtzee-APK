import {
  UPPER_FACE,
  UPPER_CATEGORIES,
  LOWER_CATEGORIES,
  type CategoryId,
  type UpperCategory,
  type RuleSet,
} from './types'

/** Tally of how many dice show each face. Index 1..6; index 0 is unused. */
export function faceCounts(values: readonly number[]): number[] {
  const counts = new Array<number>(7).fill(0)
  for (const v of values) counts[v] = (counts[v] ?? 0) + 1
  return counts
}

export function sumOf(values: readonly number[]): number {
  let total = 0
  for (const v of values) total += v
  return total
}

/** Longest run of consecutive distinct faces present. */
export function longestRun(values: readonly number[]): number {
  const counts = faceCounts(values)
  let best = 0
  let run = 0
  for (let face = 1; face <= 6; face++) {
    if ((counts[face] ?? 0) > 0) {
      run++
      if (run > best) best = run
    } else {
      run = 0
    }
  }
  return best
}

function maxCount(values: readonly number[]): number {
  return Math.max(...faceCounts(values).slice(1))
}

/** Score a category for one exact 5-dice hand, ignoring joker rules. */
export function rawScore(category: CategoryId, values: readonly number[]): number {
  switch (category) {
    case 'ones':
    case 'twos':
    case 'threes':
    case 'fours':
    case 'fives':
    case 'sixes': {
      const face = UPPER_FACE[category as UpperCategory]
      return (faceCounts(values)[face] ?? 0) * face
    }
    case 'threeOfAKind':
      return maxCount(values) >= 3 ? sumOf(values) : 0
    case 'fourOfAKind':
      return maxCount(values) >= 4 ? sumOf(values) : 0
    case 'fullHouse': {
      const counts = faceCounts(values).slice(1).filter((c) => c > 0)
      // A true full house is exactly a triple plus a pair. Five of a kind only
      // counts here through the joker rule, handled by the caller.
      return counts.includes(3) && counts.includes(2) ? 25 : 0
    }
    case 'smallStraight':
      return longestRun(values) >= 4 ? 30 : 0
    case 'largeStraight':
      return longestRun(values) >= 5 ? 40 : 0
    case 'yahtzee':
      return maxCount(values) >= 5 ? 50 : 0
    case 'chance':
      return sumOf(values)
  }
}

/** Fixed payouts a joker unlocks: the shape requirement is waived, so the
 *  category simply pays its face value. */
const JOKER_FIXED: Partial<Record<CategoryId, number>> = {
  fullHouse: 25,
  smallStraight: 30,
  largeStraight: 40,
}

/** All k-sized subsets of `values`, as value arrays. */
function subsets(values: readonly number[], k: number): number[][] {
  const out: number[][] = []
  const current: number[] = []
  const walk = (start: number): void => {
    if (current.length === k) {
      out.push([...current])
      return
    }
    for (let i = start; i < values.length; i++) {
      current.push(values[i] as number)
      walk(i + 1)
      current.pop()
    }
  }
  walk(0)
  return out
}

/** Score a category for a rolled hand under a given rule set.
 *
 *  When more dice are rolled than score (Six Dice mode), the best-scoring
 *  legal subset is used automatically — the player never has to pick.
 *  `joker` waives the shape requirement per the forced-joker rule. */
export function scoreCategory(
  category: CategoryId,
  values: readonly number[],
  rules: RuleSet,
  joker = false,
): number {
  if (joker) {
    const fixed = JOKER_FIXED[category]
    if (fixed !== undefined) return fixed
  }

  if (values.length <= rules.scoringDice) return rawScore(category, values)

  let best = 0
  for (const subset of subsets(values, rules.scoringDice)) {
    const score = rawScore(category, subset)
    if (score > best) best = score
  }
  return best
}

/** True when the hand is a Yahtzee under this rule set (5 alike). */
export function isYahtzeeHand(values: readonly number[]): boolean {
  return values.length >= 5 && maxCount(values) >= 5
}

export type Scorecard = Partial<Record<CategoryId, number>>

export function isFilled(card: Scorecard, category: CategoryId): boolean {
  return card[category] !== undefined
}

export function upperSubtotal(card: Scorecard): number {
  let total = 0
  for (const c of UPPER_CATEGORIES) total += card[c] ?? 0
  return total
}

export function upperBonus(card: Scorecard, rules: RuleSet): number {
  return upperSubtotal(card) >= rules.upperBonusThreshold ? rules.upperBonusValue : 0
}

export function lowerSubtotal(card: Scorecard): number {
  let total = 0
  for (const c of LOWER_CATEGORIES) total += card[c] ?? 0
  return total
}

/** Points still needed for the upper bonus. Negative means already banked. */
export function pointsToBonus(card: Scorecard, rules: RuleSet): number {
  return rules.upperBonusThreshold - upperSubtotal(card)
}

export interface ColumnTotals {
  upper: number
  bonus: number
  lower: number
  yahtzeeBonus: number
  total: number
}

export function columnTotals(
  card: Scorecard,
  rules: RuleSet,
  yahtzeeBonusCount: number,
  multiplier = 1,
): ColumnTotals {
  const upper = upperSubtotal(card)
  const bonus = upperBonus(card, rules)
  const lower = lowerSubtotal(card)
  const yahtzeeBonus = yahtzeeBonusCount * rules.yahtzeeBonusValue
  return {
    upper,
    bonus,
    lower,
    yahtzeeBonus,
    total: (upper + bonus + lower + yahtzeeBonus) * multiplier,
  }
}

export function isCardComplete(card: Scorecard): boolean {
  return [...UPPER_CATEGORIES, ...LOWER_CATEGORIES].every((c) => isFilled(card, c))
}
