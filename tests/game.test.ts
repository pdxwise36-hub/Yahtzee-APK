import { describe, expect, it } from 'vitest'
import {
  createGame,
  rollDice,
  toggleHold,
  scoreSelection,
  legalCategories,
  previewScores,
  jokerState,
  diceValues,
  grandTotal,
  standings,
  totalTurns,
  openColumns,
  resolveColumn,
  type GameState,
} from '@/engine/game'
import { RULE_SETS, ALL_CATEGORIES, type DieValue } from '@/engine/types'
import type { Scorecard } from '@/engine/scoring'

const solo = () => createGame('standard', [{ id: 'p1', name: 'Ada' }], 12345)

/** Force a specific hand so rules can be tested without fighting the RNG. */
function withHand(state: GameState, values: DieValue[]): GameState {
  return {
    ...state,
    dice: state.dice.map((d, i) => ({ ...d, value: values[i] as DieValue })),
    rollsUsed: 1,
    phase: 'awaitingPick' as const,
  }
}

describe('rolling', () => {
  it('is fully determined by the seed', () => {
    const a = rollDice(createGame('standard', [{ id: 'p', name: 'A' }], 999))
    const b = rollDice(createGame('standard', [{ id: 'p', name: 'A' }], 999))
    expect(diceValues(a)).toEqual(diceValues(b))
  })

  it('produces different hands from different seeds', () => {
    const a = rollDice(createGame('standard', [{ id: 'p', name: 'A' }], 1))
    const b = rollDice(createGame('standard', [{ id: 'p', name: 'A' }], 2))
    expect(diceValues(a)).not.toEqual(diceValues(b))
  })

  it('rolls only legal die faces', () => {
    let state = createGame('standard', [{ id: 'p', name: 'A' }], 4242)
    for (let i = 0; i < 200; i++) {
      state = rollDice({ ...state, rollsUsed: 0, phase: 'awaitingRoll' })
      for (const v of diceValues(state)) {
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(6)
      }
    }
  })

  it('keeps held dice and rerolls the rest', () => {
    let state = rollDice(solo())
    const before = diceValues(state)
    state = toggleHold(state, 0)
    state = toggleHold(state, 1)
    state = rollDice(state)
    expect(state.dice[0]?.value).toBe(before[0])
    expect(state.dice[1]?.value).toBe(before[1])
  })

  it('stops after three rolls', () => {
    let state = solo()
    state = rollDice(state)
    state = rollDice(state)
    state = rollDice(state)
    expect(state.rollsUsed).toBe(3)
    const blocked = rollDice(state)
    expect(blocked.rollsUsed).toBe(3)
    expect(diceValues(blocked)).toEqual(diceValues(state))
  })

  it('refuses to hold dice after the last roll', () => {
    let state = rollDice(rollDice(rollDice(solo())))
    const held = toggleHold(state, 0)
    expect(held.dice[0]?.held).toBe(false)
  })

  it('clears holds at the start of a new turn', () => {
    let state = rollDice(solo())
    state = toggleHold(state, 0)
    expect(state.dice[0]?.held).toBe(true)
    state = scoreSelection(state, 'chance').state
    expect(state.dice.every((d) => !d.held)).toBe(true)
    expect(state.rollsUsed).toBe(0)
  })
})

describe('scoring a turn', () => {
  it('writes the score and advances the turn', () => {
    const state = withHand(solo(), [3, 3, 3, 3, 3])
    const { state: next, score } = scoreSelection(state, 'yahtzee')
    expect(score).toBe(50)
    expect(next.players[0]?.cards[0]?.yahtzee).toBe(50)
    expect(next.turnNumber).toBe(1)
    expect(next.phase).toBe('awaitingRoll')
  })

  it('permits a deliberate zero in an unmet category', () => {
    const state = withHand(solo(), [1, 2, 3, 4, 6])
    const { state: next, score } = scoreSelection(state, 'yahtzee')
    expect(score).toBe(0)
    expect(next.players[0]?.cards[0]?.yahtzee).toBe(0)
  })

  it('refuses to overwrite a filled box', () => {
    let state = withHand(solo(), [1, 1, 1, 1, 1])
    state = scoreSelection(state, 'ones').state
    const retry = scoreSelection(withHand(state, [1, 1, 1, 1, 1]), 'ones')
    expect(retry.state.players[0]?.cards[0]?.ones).toBe(5)
    expect(retry.score).toBe(0)
  })

  it('rotates players and only advances the turn after the last one', () => {
    let state = createGame('standard', [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ], 7)
    state = scoreSelection(withHand(state, [1, 1, 2, 3, 4]), 'chance').state
    expect(state.currentPlayer).toBe(1)
    expect(state.turnNumber).toBe(0)
    state = scoreSelection(withHand(state, [1, 1, 2, 3, 4]), 'chance').state
    expect(state.currentPlayer).toBe(0)
    expect(state.turnNumber).toBe(1)
  })
})

describe('joker rules', () => {
  const yahtzeeScored: Scorecard = { yahtzee: 50 }

  it('is inactive while the Yahtzee box is still open', () => {
    expect(jokerState([4, 4, 4, 4, 4], {}).active).toBe(false)
  })

  it('activates once the Yahtzee box is resolved', () => {
    const joker = jokerState([4, 4, 4, 4, 4], yahtzeeScored)
    expect(joker.active).toBe(true)
    expect(joker.earnsBonus).toBe(true)
    expect(joker.face).toBe(4)
  })

  it('grants no bonus when the Yahtzee box was zeroed', () => {
    const joker = jokerState([4, 4, 4, 4, 4], { yahtzee: 0 })
    expect(joker.active).toBe(true)
    expect(joker.earnsBonus).toBe(false)
  })

  it('forces the matching upper box when it is open', () => {
    const legal = legalCategories([4, 4, 4, 4, 4], yahtzeeScored, RULE_SETS.standard)
    expect(legal).toEqual(['fours'])
  })

  it('opens the lower section once the matching upper box is filled', () => {
    const card: Scorecard = { yahtzee: 50, fours: 16 }
    const legal = legalCategories([4, 4, 4, 4, 4], card, RULE_SETS.standard)
    expect(legal).toContain('fullHouse')
    expect(legal).toContain('largeStraight')
    expect(legal).not.toContain('fours')
    expect(legal).not.toContain('ones')
  })

  it('falls back to a zero in the upper section when the lower is full', () => {
    const card: Scorecard = {
      yahtzee: 50, fours: 16, threeOfAKind: 20, fourOfAKind: 20,
      fullHouse: 25, smallStraight: 30, largeStraight: 40, chance: 20,
    }
    const legal = legalCategories([4, 4, 4, 4, 4], card, RULE_SETS.standard)
    expect(legal).not.toContain('fours')
    expect(legal.every((c) => ['ones', 'twos', 'threes', 'fives', 'sixes'].includes(c))).toBe(true)
  })

  it('pays the joker value and banks the 100-point bonus', () => {
    let state = solo()
    state = { ...state, players: state.players.map((p) => ({ ...p, cards: [{ yahtzee: 50, fours: 16 }] })) }
    const result = scoreSelection(withHand(state, [4, 4, 4, 4, 4]), 'largeStraight')
    expect(result.score).toBe(40)
    expect(result.yahtzeeBonus).toBe(true)
    expect(result.state.players[0]?.yahtzeeBonuses[0]).toBe(1)
  })

  it('rejects an illegal category while a joker is forcing the choice', () => {
    let state = solo()
    state = { ...state, players: state.players.map((p) => ({ ...p, cards: [{ yahtzee: 50 }] })) }
    const result = scoreSelection(withHand(state, [4, 4, 4, 4, 4]), 'chance')
    expect(result.score).toBe(0)
    expect(result.state.players[0]?.cards[0]?.chance).toBeUndefined()
  })
})

describe('previews', () => {
  it('offers a number for every open box and nothing for filled ones', () => {
    const preview = previewScores([1, 2, 3, 4, 5], { chance: 15 }, RULE_SETS.standard)
    expect(preview.largeStraight).toBe(40)
    expect(preview.smallStraight).toBe(30)
    expect(preview.chance).toBeUndefined()
  })
})

describe('game completion', () => {
  it('ends only when every box on every card is filled', () => {
    let state = solo()
    for (const category of ALL_CATEGORIES) {
      expect(state.phase).not.toBe('gameOver')
      state = scoreSelection(withHand(state, [1, 2, 3, 4, 5]), category).state
    }
    expect(state.phase).toBe('gameOver')
    expect(state.history).toHaveLength(ALL_CATEGORIES.length)
  })

  it('requires every column of Triple Yahtzee', () => {
    expect(totalTurns(RULE_SETS.triple)).toBe(39)
    let state = createGame('triple', [{ id: 'p', name: 'A' }], 5)
    for (let column = 0; column < 3; column++) {
      for (const category of ALL_CATEGORIES) {
        state = scoreSelection(withHand(state, [6, 6, 6, 6, 6]), category, column).state
      }
    }
    expect(state.phase).toBe('gameOver')
  })

  it('ranks players and ties share a rank', () => {
    let state = createGame('standard', [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ], 3)
    state = {
      ...state,
      players: [
        { ...state.players[0]!, cards: [{ chance: 20 }] },
        { ...state.players[1]!, cards: [{ chance: 30 }] },
        { ...state.players[2]!, cards: [{ chance: 20 }] },
      ],
    }
    const table = standings(state)
    expect(table[0]?.player.id).toBe('b')
    expect(table[0]?.rank).toBe(1)
    expect(table[1]?.rank).toBe(2)
    expect(table[2]?.rank).toBe(2)
    expect(grandTotal(state.players[1]!, state.rules)).toBe(30)
  })
})

describe('multi-column play', () => {
  it('reports which columns still have boxes free', () => {
    let state = createGame('triple', [{ id: 'p', name: 'A' }], 11)
    expect(openColumns(state.players[0]!)).toEqual([0, 1, 2])
    for (const category of ALL_CATEGORIES) {
      state = scoreSelection(withHand(state, [1, 2, 3, 4, 5]), category, 0).state
    }
    expect(openColumns(state.players[0]!)).toEqual([1, 2])
  })

  it('keeps the chosen column while it is still playable', () => {
    const state = createGame('triple', [{ id: 'p', name: 'A' }], 11)
    expect(resolveColumn(state.players[0]!, 2)).toBe(2)
  })

  it('never strands a player on a finished column', () => {
    // Filling one column used to leave the player with no legal move anywhere,
    // unable to score or to finish the game.
    let state = createGame('triple', [{ id: 'p', name: 'A' }], 11)
    for (const category of ALL_CATEGORIES) {
      state = scoreSelection(withHand(state, [1, 2, 3, 4, 5]), category, 0).state
    }
    expect(state.phase).not.toBe('gameOver')
    expect(resolveColumn(state.players[0]!, 0)).toBe(1)
  })

  it('can complete a full three-column game one column at a time', () => {
    let state = createGame('triple', [{ id: 'p', name: 'A' }], 11)
    for (let turn = 0; turn < ALL_CATEGORIES.length * 3; turn++) {
      const player = state.players[0]!
      const column = resolveColumn(player, 0)
      const open = ALL_CATEGORIES.filter((c) => player.cards[column]?.[c] === undefined)
      state = scoreSelection(withHand(state, [1, 2, 3, 4, 5]), open[0]!, column).state
    }
    expect(state.phase).toBe('gameOver')
  })
})
