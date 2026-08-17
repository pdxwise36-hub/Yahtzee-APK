import {
  ALL_CATEGORIES,
  UPPER_CATEGORIES,
  UPPER_FACE,
  type CategoryId,
  type DieValue,
  type RuleSet,
  type UpperCategory,
} from '@/engine/types'
import { isFilled, scoreCategory, upperSubtotal, type Scorecard } from '@/engine/scoring'
import { jokerState, legalCategories, type AiLevel } from '@/engine/game'
import type { Rng } from '@/engine/rng'
import { handIndex, handKey, handsOfSize, keepDistributions } from './probability'

/** Roughly what each box is worth if left open and played for later. Used as
 *  the opportunity cost of filling it now: a box is only worth taking when the
 *  hand beats what the box would ordinarily yield. */
const CATEGORY_BASELINE: Record<CategoryId, number> = {
  ones: 2.1,
  twos: 4.2,
  threes: 6.3,
  fours: 8.4,
  fives: 10.5,
  sixes: 12.6,
  threeOfAKind: 21.7,
  fourOfAKind: 13.1,
  fullHouse: 22.6,
  smallStraight: 29.5,
  largeStraight: 32.7,
  yahtzee: 16.5,
  chance: 22.0,
}

/** How much reasoning a difficulty brings to valuing a box.
 *  immediate: raw points only.
 *  basic:     points minus what the box would usually be worth later.
 *  full:      also chases the upper bonus and extra-Yahtzee bonuses. */
export type ValuationMode = 'immediate' | 'basic' | 'full'

const MODE_BY_LEVEL: Record<AiLevel, ValuationMode> = {
  easy: 'immediate',
  medium: 'immediate',
  hard: 'basic',
  expert: 'full',
}

/** Weights for the expert valuation. These are not guesses: they were chosen
 *  by sweeping candidate values over batches of simulated games and keeping
 *  the combination with the highest average score. */
export const TUNING = {
  /** How heavily to discount a box by what it would usually be worth later. */
  opportunityCost: 0.8,
  /** Value of each point above (or below) par on an upper box, while the
   *  bonus is still reachable. */
  bonusPace: 0.9,
  /** Flat credit for keeping the bonus on track. */
  bonusPremium: 0.06,
  /** How much of an extra Yahtzee's 100 points to count when choosing. */
  yahtzeeBonus: 0.3,
}

export interface AiContext {
  card: Scorecard
  rules: RuleSet
  level: AiLevel
  /** Turns still to play on this card, for weighing opportunity cost. */
  turnsLeft: number
  rng: Rng
}

/** Strategic worth of committing this hand to this category.
 *
 *  Beyond the points themselves this accounts for two things a naive player
 *  misses: the upper bonus, which makes a fat Sixes box worth more than its
 *  face value, and the cost of burning a box that would usually pay more. */
function categoryValue(
  category: CategoryId,
  values: readonly DieValue[],
  context: AiContext,
  mode: ValuationMode,
): number {
  const { card, rules } = context
  const joker = jokerState(values, card)
  const score = scoreCategory(category, values, rules, joker.active)
  if (mode === 'immediate') return score

  let value = score

  // Opportunity cost fades as the card fills: on the last turn there is no
  // "later" to save a box for.
  const urgency = Math.min(1, context.turnsLeft / 8)
  value -= CATEGORY_BASELINE[category] * urgency * TUNING.opportunityCost

  if (mode === 'basic') return value

  if (UPPER_CATEGORIES.includes(category as UpperCategory)) {
    const face = UPPER_FACE[category as UpperCategory]
    const subtotal = upperSubtotal(card)
    const shortfall = rules.upperBonusThreshold - subtotal
    if (shortfall > 0) {
      // Three of a face is par for the bonus. Beating par is worth extra,
      // falling short costs, in proportion to how live the bonus still is.
      const par = face * 3
      const bonusPressure = Math.min(1, shortfall / 24)
      value += (score - par) * TUNING.bonusPace * bonusPressure
      if (score >= par) value += rules.upperBonusValue * TUNING.bonusPremium * bonusPressure
    }
  }

  // An extra Yahtzee is worth a great deal once the box is already scored at 50.
  if (joker.active && joker.earnsBonus) value += rules.yahtzeeBonusValue * TUNING.yahtzeeBonus

  return value
}

/** Best category for a hand, and what that choice is worth. */
function bestCategory(
  values: readonly DieValue[],
  context: AiContext,
  mode: ValuationMode,
): { category: CategoryId; value: number } {
  const legal = legalCategories(values, context.card, context.rules)
  let best: CategoryId = legal[0] ?? 'chance'
  let bestValue = -Infinity
  for (const category of legal) {
    const value = categoryValue(category, values, context, mode)
    if (value > bestValue) {
      bestValue = value
      best = category
    }
  }
  return { category: best, value: bestValue }
}

/** Exact expected value of a hand with `rollsLeft` rerolls remaining.
 *
 *  This is a full enumeration, not a sample: every keep decision is weighed
 *  against the true probability distribution of what the rerolled dice can
 *  become, recursively down to the final hand. */
function createEvaluator(context: AiContext, mode: ValuationMode) {
  const size = context.rules.diceCount
  const hands = handsOfSize(size)

  // Value of every possible final hand, given this scorecard.
  const terminal = new Float64Array(hands.length)
  for (let i = 0; i < hands.length; i++) {
    terminal[i] = bestCategory(hands[i] as DieValue[], context, mode).value
  }

  /** One backward step: the value of each hand given one more reroll. */
  const step = (next: Float64Array): Float64Array => {
    const current = new Float64Array(hands.length)
    for (let i = 0; i < hands.length; i++) {
      let best = -Infinity
      for (const keep of keepDistributions(size, hands[i] as DieValue[])) {
        let sum = 0
        for (let k = 0; k < keep.hands.length; k++) {
          sum += (keep.probabilities[k] as number) * (next[keep.hands[k] as number] as number)
        }
        if (sum > best) best = sum
      }
      current[i] = best
    }
    return current
  }

  // levels[r] is the expected value of a hand with r rerolls still to come.
  const levels: Float64Array[] = [terminal]
  for (let r = 1; r < context.rules.rollsPerTurn; r++) {
    levels.push(step(levels[r - 1] as Float64Array))
  }

  const bestKeep = (values: readonly DieValue[], rollsLeft: number): number[] => {
    const next = levels[Math.max(0, Math.min(rollsLeft, levels.length) - 1)] as Float64Array
    let best: number[] = [...values]
    let bestValue = -Infinity
    for (const keep of keepDistributions(size, values)) {
      let sum = 0
      for (let k = 0; k < keep.hands.length; k++) {
        sum += (keep.probabilities[k] as number) * (next[keep.hands[k] as number] as number)
      }
      if (sum > bestValue) {
        bestValue = sum
        best = keep.kept
      }
    }
    return best
  }

  const expected = (values: readonly DieValue[], rollsLeft: number): number => {
    const level = levels[Math.min(rollsLeft, levels.length - 1)] as Float64Array
    return level[handIndex(size, handKey(values))] as number
  }

  return { expected, bestKeep }
}

/** The search is rebuilt whenever the scorecard changes, but both keep
 *  decisions inside a single turn share one, which halves the work per turn. */
let cachedEvaluator: { key: string; evaluator: ReturnType<typeof createEvaluator> } | null = null

function evaluatorFor(context: AiContext, mode: ValuationMode) {
  const key = `${mode}:${context.turnsLeft}:${context.rules.id}:${JSON.stringify(context.card)}`
  if (cachedEvaluator?.key === key) return cachedEvaluator.evaluator
  const evaluator = createEvaluator(context, mode)
  cachedEvaluator = { key, evaluator }
  return evaluator
}

/** Turn a kept multiset back into per-die hold flags. */
function keepFlags(values: readonly DieValue[], kept: readonly number[]): boolean[] {
  const remaining = [...kept]
  return values.map((value) => {
    const index = remaining.indexOf(value)
    if (index === -1) return false
    remaining.splice(index, 1)
    return true
  })
}

/** How many of the most common face are showing, and which face it is. */
function modeFace(values: readonly DieValue[]): DieValue {
  const counts = new Array<number>(7).fill(0)
  for (const v of values) counts[v] = (counts[v] as number) + 1
  let best: DieValue = 1
  for (let f = 2; f <= 6; f++) {
    if ((counts[f] as number) > (counts[best] as number)) best = f as DieValue
  }
  return best
}

export function chooseKeep(
  values: readonly DieValue[],
  rollsLeft: number,
  context: AiContext,
): boolean[] {
  switch (context.level) {
    case 'easy': {
      // Chases whatever it has the most of, and sometimes keeps nothing at all.
      if (context.rng.next() < 0.18) return values.map(() => false)
      const face = modeFace(values)
      return values.map((v) => v === face)
    }
    case 'medium': {
      // Keeps the dice that serve its best immediate category.
      const { category } = bestCategory(values, context, 'immediate')
      return keepFlags(values, greedyKeepFor(category, values))
    }
    case 'hard':
    case 'expert': {
      const mode = MODE_BY_LEVEL[context.level]
      return keepFlags(values, evaluatorFor(context, mode).bestKeep(values, rollsLeft))
    }
  }
}

/** Which dice obviously serve a category, without any lookahead. */
function greedyKeepFor(category: CategoryId, values: readonly DieValue[]): number[] {
  if (UPPER_CATEGORIES.includes(category as UpperCategory)) {
    const face = UPPER_FACE[category as UpperCategory]
    return values.filter((v) => v === face)
  }
  switch (category) {
    case 'smallStraight':
    case 'largeStraight': {
      const unique = [...new Set(values)].sort((a, b) => a - b)
      return unique
    }
    case 'chance':
      return values.filter((v) => v >= 4)
    default: {
      const face = modeFace(values)
      return values.filter((v) => v === face)
    }
  }
}

export function chooseCategory(
  values: readonly DieValue[],
  context: AiContext,
): CategoryId {
  if (context.level === 'easy') {
    const legal = legalCategories(values, context.card, context.rules)
    // Mostly sensible, occasionally careless — which is what makes it easy.
    if (context.rng.next() < 0.25) {
      return legal[context.rng.int(0, legal.length - 1)] as CategoryId
    }
    return bestCategory(values, context, 'immediate').category
  }
  return bestCategory(values, context, MODE_BY_LEVEL[context.level]).category
}

/** For Triple Yahtzee, pick the column as well: a big hand belongs in the
 *  triple-scoring column, a sacrifice belongs in the single. */
export function chooseColumn(
  values: readonly DieValue[],
  cards: readonly Scorecard[],
  context: Omit<AiContext, 'card'>,
): { column: number; category: CategoryId } {
  let bestColumn = 0
  let bestCategoryId: CategoryId = 'chance'
  let bestValue = -Infinity

  cards.forEach((card, column) => {
    if (ALL_CATEGORIES.every((c) => isFilled(card, c))) return
    const scoped: AiContext = { ...context, card }
    const { category, value } = bestCategory(values, scoped, MODE_BY_LEVEL[context.level])
    const weighted = value * (context.rules.columnMultipliers[column] ?? 1)
    if (weighted > bestValue) {
      bestValue = weighted
      bestColumn = column
      bestCategoryId = category
    }
  })

  return { column: bestColumn, category: bestCategoryId }
}
