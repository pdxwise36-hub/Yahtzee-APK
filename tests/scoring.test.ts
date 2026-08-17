import { describe, expect, it } from 'vitest'
import {
  faceCounts,
  longestRun,
  rawScore,
  scoreCategory,
  isYahtzeeHand,
  upperBonus,
  columnTotals,
  isCardComplete,
} from '@/engine/scoring'
import { RULE_SETS, ALL_CATEGORIES } from '@/engine/types'

const classic = RULE_SETS.standard
const six = RULE_SETS.sixDice

describe('faceCounts / longestRun', () => {
  it('tallies faces', () => {
    expect(faceCounts([1, 1, 3, 6, 6]).slice(1)).toEqual([2, 0, 1, 0, 0, 2])
  })

  it('measures consecutive runs, not sorted length', () => {
    expect(longestRun([1, 2, 3, 4, 5])).toBe(5)
    expect(longestRun([2, 3, 4, 5, 5])).toBe(4)
    expect(longestRun([1, 2, 4, 5, 6])).toBe(3)
    expect(longestRun([1, 1, 1, 1, 1])).toBe(1)
  })
})

describe('upper section', () => {
  it('sums only the matching face', () => {
    expect(rawScore('threes', [3, 3, 3, 1, 6])).toBe(9)
    expect(rawScore('sixes', [3, 3, 3, 1, 6])).toBe(6)
    expect(rawScore('fives', [1, 2, 3, 4, 6])).toBe(0)
  })
})

describe('three and four of a kind', () => {
  it('pays the total of all five dice, not just the set', () => {
    expect(rawScore('threeOfAKind', [4, 4, 4, 2, 6])).toBe(20)
    expect(rawScore('fourOfAKind', [4, 4, 4, 4, 6])).toBe(22)
  })

  it('pays nothing when the set is short', () => {
    expect(rawScore('threeOfAKind', [4, 4, 2, 3, 6])).toBe(0)
    expect(rawScore('fourOfAKind', [4, 4, 4, 3, 6])).toBe(0)
  })

  it('counts a Yahtzee as both three and four of a kind', () => {
    expect(rawScore('threeOfAKind', [5, 5, 5, 5, 5])).toBe(25)
    expect(rawScore('fourOfAKind', [5, 5, 5, 5, 5])).toBe(25)
  })
})

describe('full house', () => {
  it('needs exactly a triple and a pair', () => {
    expect(rawScore('fullHouse', [2, 2, 5, 5, 5])).toBe(25)
    expect(rawScore('fullHouse', [2, 2, 2, 5, 6])).toBe(0)
  })

  it('does not treat five of a kind as a full house outside the joker rule', () => {
    expect(rawScore('fullHouse', [4, 4, 4, 4, 4])).toBe(0)
  })
})

describe('straights', () => {
  it('scores a small straight from four in a row', () => {
    expect(rawScore('smallStraight', [1, 2, 3, 4, 4])).toBe(30)
    expect(rawScore('smallStraight', [3, 4, 5, 6, 1])).toBe(30)
    expect(rawScore('smallStraight', [1, 2, 3, 5, 6])).toBe(0)
  })

  it('scores a large straight only from five in a row', () => {
    expect(rawScore('largeStraight', [1, 2, 3, 4, 5])).toBe(40)
    expect(rawScore('largeStraight', [2, 3, 4, 5, 6])).toBe(40)
    expect(rawScore('largeStraight', [1, 2, 3, 4, 6])).toBe(0)
  })

  it('counts a large straight as a small straight too', () => {
    expect(rawScore('smallStraight', [2, 3, 4, 5, 6])).toBe(30)
  })
})

describe('yahtzee and chance', () => {
  it('pays 50 for five alike', () => {
    expect(rawScore('yahtzee', [6, 6, 6, 6, 6])).toBe(50)
    expect(rawScore('yahtzee', [6, 6, 6, 6, 1])).toBe(0)
    expect(isYahtzeeHand([2, 2, 2, 2, 2])).toBe(true)
    expect(isYahtzeeHand([2, 2, 2, 2, 3])).toBe(false)
  })

  it('always pays the sum for chance', () => {
    expect(rawScore('chance', [1, 2, 3, 4, 5])).toBe(15)
  })
})

describe('joker scoring', () => {
  it('waives the shape requirement for fixed-value categories', () => {
    expect(scoreCategory('fullHouse', [3, 3, 3, 3, 3], classic, true)).toBe(25)
    expect(scoreCategory('smallStraight', [3, 3, 3, 3, 3], classic, true)).toBe(30)
    expect(scoreCategory('largeStraight', [3, 3, 3, 3, 3], classic, true)).toBe(40)
  })

  it('leaves sum-based categories alone', () => {
    expect(scoreCategory('chance', [3, 3, 3, 3, 3], classic, true)).toBe(15)
    expect(scoreCategory('threes', [3, 3, 3, 3, 3], classic, true)).toBe(15)
  })
})

describe('six-dice mode', () => {
  it('picks the best five of the six automatically', () => {
    // 1,2,3,4,5 is in here alongside a junk 1.
    expect(scoreCategory('largeStraight', [1, 1, 2, 3, 4, 5], six, false)).toBe(40)
  })

  it('maximises sum categories across subsets', () => {
    // Best five for chance drops the lowest die.
    expect(scoreCategory('chance', [1, 6, 6, 6, 6, 6], six, false)).toBe(30)
  })

  it('caps an upper category at five scoring dice', () => {
    expect(scoreCategory('sixes', [6, 6, 6, 6, 6, 6], six, false)).toBe(30)
  })

  it('finds a Yahtzee hidden among six dice', () => {
    expect(scoreCategory('yahtzee', [2, 4, 4, 4, 4, 4], six, false)).toBe(50)
  })
})

describe('totals', () => {
  it('awards the upper bonus at the threshold, not above it', () => {
    const atThreshold = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 }
    expect(upperBonus(atThreshold, classic)).toBe(35)
    const justUnder = { ...atThreshold, sixes: 17 }
    expect(upperBonus(justUnder, classic)).toBe(0)
  })

  it('applies the column multiplier to the whole column', () => {
    const card = { ones: 3, yahtzee: 50 }
    const single = columnTotals(card, classic, 0, 1)
    const tripled = columnTotals(card, classic, 0, 3)
    expect(single.total).toBe(53)
    expect(tripled.total).toBe(159)
  })

  it('adds 100 per extra Yahtzee', () => {
    expect(columnTotals({ yahtzee: 50 }, classic, 2, 1).total).toBe(250)
  })

  it('detects a complete card', () => {
    const full = Object.fromEntries(ALL_CATEGORIES.map((c) => [c, 0]))
    expect(isCardComplete(full)).toBe(true)
    expect(isCardComplete({ ones: 1 })).toBe(false)
  })
})
