import {
  createGame,
  currentPlayer,
  diceValues,
  grandTotal,
  rollDice,
  scoreSelection,
  toggleHold,
  type AiLevel,
  type GameState,
} from '@/engine/game'
import { ALL_CATEGORIES, type CategoryId, type VariantId } from '@/engine/types'
import { isFilled } from '@/engine/scoring'
import { createRng, type Rng } from '@/engine/rng'
import { chooseCategory, chooseColumn, chooseKeep, type AiContext } from './policy'

function contextFor(state: GameState, column: number, rng: Rng): AiContext {
  const player = currentPlayer(state)
  const card = player.cards[column] ?? {}
  return {
    card,
    rules: state.rules,
    level: player.aiLevel ?? 'medium',
    turnsLeft: ALL_CATEGORIES.filter((c) => !isFilled(card, c)).length,
    rng,
  }
}

/** Which column this AI intends to play into, decided before it keeps dice so
 *  that its keeps serve the column it is actually aiming at. */
export function aiColumn(state: GameState, rng: Rng): number {
  if (state.rules.columns === 1) return 0
  const player = currentPlayer(state)
  const { column } = chooseColumn(diceValues(state), player.cards, {
    rules: state.rules,
    level: player.aiLevel ?? 'medium',
    turnsLeft: ALL_CATEGORIES.length,
    rng,
  })
  return column
}

export function aiHolds(state: GameState, rng: Rng, column = 0): boolean[] {
  const rollsLeft = state.rules.rollsPerTurn - state.rollsUsed
  return chooseKeep(diceValues(state), rollsLeft, contextFor(state, column, rng))
}

export function aiMove(state: GameState, rng: Rng): { category: CategoryId; column: number } {
  const column = aiColumn(state, rng)
  return { category: chooseCategory(diceValues(state), contextFor(state, column, rng)), column }
}

/** Play one AI turn to completion, with no animation. The UI drives the same
 *  decisions step by step so the player can watch; this is for simulation. */
export function playAiTurn(state: GameState, rng: Rng): GameState {
  let next = rollDice(state)
  const column = aiColumn(next, rng)

  while (next.rollsUsed < next.rules.rollsPerTurn) {
    const holds = aiHolds(next, rng, column)
    // Stop early when the AI wants to keep everything: rerolling nothing is
    // just a wasted roll.
    if (holds.every(Boolean)) break
    next.dice.forEach((die, i) => {
      if (holds[i] !== die.held) next = toggleHold(next, die.id)
    })
    next = rollDice(next)
  }

  const move = aiMove(next, rng)
  return scoreSelection(next, move.category, move.column).state
}

/** Play a full solo game and return the final score. Used to measure how much
 *  stronger each difficulty actually is. */
export function playAiGame(variant: VariantId, level: AiLevel, seed: number): number {
  let state = createGame(variant, [{ id: 'ai', name: level, isAI: true, aiLevel: level }], seed)
  const rng = createRng(seed ^ 0x5bf03635)
  let guard = 0
  while (state.phase !== 'gameOver' && guard++ < 200) {
    state = playAiTurn(state, rng)
  }
  return grandTotal(state.players[0]!, state.rules)
}
