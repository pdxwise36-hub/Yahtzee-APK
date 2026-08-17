/** Core domain types for the Yahtzee rules engine.
 *  Everything here is pure data — no DOM, no rendering, no side effects. */

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6

export interface Die {
  /** Stable identity so the 3D layer can track a die across rolls. */
  id: number
  value: DieValue
  held: boolean
}

export type UpperCategory = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes'

export type LowerCategory =
  | 'threeOfAKind'
  | 'fourOfAKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'yahtzee'
  | 'chance'

export type CategoryId = UpperCategory | LowerCategory

export const UPPER_CATEGORIES: readonly UpperCategory[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
] as const

export const LOWER_CATEGORIES: readonly LowerCategory[] = [
  'threeOfAKind',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yahtzee',
  'chance',
] as const

export const ALL_CATEGORIES: readonly CategoryId[] = [
  ...UPPER_CATEGORIES,
  ...LOWER_CATEGORIES,
] as const

/** The face value each upper category counts. ones -> 1, sixes -> 6. */
export const UPPER_FACE: Record<UpperCategory, DieValue> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  threeOfAKind: 'Three of a Kind',
  fourOfAKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yahtzee: 'YAHTZEE',
  chance: 'Chance',
}

export type VariantId = 'standard' | 'triple' | 'sixDice'

export interface RuleSet {
  id: VariantId
  name: string
  /** How many dice are physically rolled. */
  diceCount: number
  /** How many dice actually score a category. With 6 dice, the best 5 count. */
  scoringDice: number
  rollsPerTurn: number
  /** Scorecard columns. Triple Yahtzee has 3. */
  columns: number
  /** Per-column score multiplier, parallel to `columns`. */
  columnMultipliers: number[]
  upperBonusThreshold: number
  upperBonusValue: number
  /** Awarded for each Yahtzee after the first, when the first scored 50. */
  yahtzeeBonusValue: number
  /** Whether forced-joker rules apply to extra Yahtzees. */
  jokerRules: boolean
}

export const RULE_SETS: Record<VariantId, RuleSet> = {
  standard: {
    id: 'standard',
    name: 'Classic',
    diceCount: 5,
    scoringDice: 5,
    rollsPerTurn: 3,
    columns: 1,
    columnMultipliers: [1],
    upperBonusThreshold: 63,
    upperBonusValue: 35,
    yahtzeeBonusValue: 100,
    jokerRules: true,
  },
  triple: {
    id: 'triple',
    name: 'Triple Yahtzee',
    diceCount: 5,
    scoringDice: 5,
    rollsPerTurn: 3,
    columns: 3,
    columnMultipliers: [1, 2, 3],
    upperBonusThreshold: 63,
    upperBonusValue: 35,
    yahtzeeBonusValue: 100,
    jokerRules: true,
  },
  sixDice: {
    id: 'sixDice',
    name: 'Six Dice',
    diceCount: 6,
    scoringDice: 5,
    rollsPerTurn: 3,
    columns: 1,
    columnMultipliers: [1],
    upperBonusThreshold: 63,
    upperBonusValue: 35,
    yahtzeeBonusValue: 100,
    jokerRules: true,
  },
}
