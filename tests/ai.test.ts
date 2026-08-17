import { describe, expect, it } from 'vitest'
import { keepOptions, rerollDistribution, rollOutcomes, handKey } from '@/ai/probability'
import { chooseCategory, chooseKeep, type AiContext } from '@/ai/policy'
import { playAiGame } from '@/ai/autoplay'
import { RULE_SETS } from '@/engine/types'
import { createRng } from '@/engine/rng'
import type { Scorecard } from '@/engine/scoring'

const context = (card: Scorecard, level: AiContext['level'], turnsLeft = 13): AiContext => ({
  card,
  rules: RULE_SETS.standard,
  level,
  turnsLeft,
  rng: createRng(1),
})

describe('probability', () => {
  it('gives a complete distribution for any number of rerolled dice', () => {
    for (let count = 0; count <= 5; count++) {
      const total = rollOutcomes(count).reduce((sum, o) => sum + o.probability, 0)
      expect(total).toBeCloseTo(1, 10)
    }
  })

  it('counts the right number of distinct hands', () => {
    // Multisets of 5 from 6 faces: C(10,5) = 252.
    expect(rollOutcomes(5)).toHaveLength(252)
    expect(rollOutcomes(1)).toHaveLength(6)
  })

  it('matches known odds', () => {
    // Rolling five fresh dice: a Yahtzee is 6/7776.
    const outcomes = rollOutcomes(5)
    const yahtzee = outcomes
      .filter((o) => new Set(o.values).size === 1)
      .reduce((sum, o) => sum + o.probability, 0)
    expect(yahtzee).toBeCloseTo(6 / 7776, 10)

    // Keeping four of a kind, the chance of completing it is 1 in 6.
    const distribution = rerollDistribution([5, 5, 5, 5], 5)
    expect(distribution.get(handKey([5, 5, 5, 5, 5]))).toBeCloseTo(1 / 6, 10)
  })

  it('always produces a normalised reroll distribution', () => {
    for (const kept of [[], [3], [3, 3], [1, 2, 3, 4], [6, 6, 6, 6, 6]]) {
      const total = [...rerollDistribution(kept, 5).values()].reduce((a, b) => a + b, 0)
      expect(total).toBeCloseTo(1, 10)
    }
  })

  it('collapses keeps that are the same decision', () => {
    // Five identical dice offer only "keep 0..5 of them".
    expect(keepOptions([4, 4, 4, 4, 4])).toHaveLength(6)
    // Five different dice give the full power set.
    expect(keepOptions([1, 2, 3, 4, 5])).toHaveLength(32)
  })
})

describe('expert decisions', () => {
  it('keeps four of a kind rather than breaking it up', () => {
    const holds = chooseKeep([6, 6, 6, 6, 2], 2, context({}, 'expert'))
    expect(holds.slice(0, 4).every(Boolean)).toBe(true)
    expect(holds[4]).toBe(false)
  })

  it('keeps a made large straight and rerolls nothing', () => {
    const holds = chooseKeep([1, 2, 3, 4, 5], 1, context({}, 'expert'))
    expect(holds.every(Boolean)).toBe(true)
  })

  it('keeps the four dice of an open-ended straight draw', () => {
    const holds = chooseKeep([2, 3, 4, 5, 5], 1, context({}, 'expert'))
    expect(holds).toEqual([true, true, true, true, false])
  })

  it('takes the large straight when it has one', () => {
    expect(chooseCategory([2, 3, 4, 5, 6], context({}, 'expert'))).toBe('largeStraight')
  })

  it('takes the Yahtzee rather than scoring it as chance', () => {
    expect(chooseCategory([5, 5, 5, 5, 5], context({}, 'expert'))).toBe('yahtzee')
  })

  it('sacrifices its cheapest box on a hopeless final hand', () => {
    // Only Ones and Yahtzee remain, and the hand is neither.
    const card: Scorecard = {
      twos: 4, threes: 9, fours: 12, fives: 15, sixes: 18,
      threeOfAKind: 20, fourOfAKind: 0, fullHouse: 25,
      smallStraight: 30, largeStraight: 40, chance: 22,
    }
    // Throwing away Yahtzee costs far more than throwing away Ones.
    expect(chooseCategory([2, 3, 4, 6, 6], context(card, 'expert', 2))).toBe('ones')
  })

  it('chases the upper bonus when it is still within reach', () => {
    // Sitting on 60 of the 63 needed, three sixes finishes the job.
    const card: Scorecard = { ones: 3, twos: 6, threes: 9, fours: 20, fives: 22 }
    expect(chooseCategory([6, 6, 6, 2, 1], context(card, 'expert', 8))).toBe('sixes')
  })
})

describe('difficulty actually differs', () => {
  // Yahtzee scores swing widely, so a handful of games cannot separate two
  // similar opponents. These batches are large enough that the ordering below
  // reflects skill rather than luck.
  const GAMES = 60
  const average = (level: Parameters<typeof playAiGame>[1]): number => {
    let total = 0
    for (let i = 0; i < GAMES; i++) total += playAiGame('standard', level, 1000 + i * 7919)
    return total / GAMES
  }

  it('ranks easy below medium below hard below expert', () => {
    const easy = average('easy')
    const medium = average('medium')
    const hard = average('hard')
    const expert = average('expert')
    // Logged so a regression in playing strength is visible, not just pass/fail.
    console.log(
      `easy ${easy.toFixed(0)} | medium ${medium.toFixed(0)} | hard ${hard.toFixed(0)} | expert ${expert.toFixed(0)}`,
    )
    expect(easy).toBeLessThan(medium)
    expect(medium).toBeLessThan(hard)
    expect(hard).toBeLessThan(expert)
  })

  it('plays expert at a genuinely strong standard', () => {
    // Optimal solitaire play averages about 254. Good humans land around 240.
    const average60 = average('expert')
    expect(average60).toBeGreaterThan(225)
  })

  it('always completes a legal game in every variant', () => {
    for (const level of ['easy', 'medium', 'hard', 'expert'] as const) {
      for (const variant of ['standard', 'triple', 'sixDice'] as const) {
        const score = playAiGame(variant, level, 4242)
        expect(score).toBeGreaterThan(0)
      }
    }
  })
})
