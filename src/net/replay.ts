import {
  createGame,
  legalCategories,
  rollDice,
  scoreSelection,
  toggleHold,
  canRoll,
  diceValues,
  type GameState,
} from '@/engine/game'
import { isFilled } from '@/engine/scoring'
import type { MatchSetup, SignedMove } from './protocol'

export function initialState(setup: MatchSetup): GameState {
  const seated = [...setup.players].sort((a, b) => a.seat - b.seat)
  return createGame(
    setup.variant,
    seated.map((p) => ({ id: p.id, name: p.name })),
    setup.seed,
  )
}

/** Whether a move is legal for the player who sent it.
 *
 *  Every client checks this independently, so a malformed or out-of-turn
 *  message from one device is rejected everywhere rather than corrupting the
 *  match. The backend enforces sequence ordering; the rules are enforced here,
 *  by the same engine that runs the local game. */
export function isLegalMove(state: GameState, signed: SignedMove): boolean {
  if (state.phase === 'gameOver') return false
  if (signed.seat !== state.currentPlayer) return false

  // Bound to a local so the switch narrows the union.
  const move = signed.move
  switch (move.type) {
    case 'roll':
      return canRoll(state)
    case 'hold':
      // Holding is only meaningful between rolls, and only on a real die.
      if (state.rollsUsed === 0 || state.rollsUsed >= state.rules.rollsPerTurn) return false
      return state.dice.some((die) => die.id === move.dieId)
    case 'score': {
      const { category, column } = move
      if (state.rollsUsed === 0) return false
      const card = state.players[state.currentPlayer]?.cards[column]
      if (!card || isFilled(card, category)) return false
      return legalCategories(diceValues(state), card, state.rules).includes(category)
    }
  }
}

export function applyMove(state: GameState, signed: SignedMove): GameState {
  const move = signed.move
  switch (move.type) {
    case 'roll':
      return rollDice(state)
    case 'hold':
      return toggleHold(state, move.dieId)
    case 'score':
      return scoreSelection(state, move.category, move.column).state
  }
}

export interface ReplayResult {
  state: GameState
  /** Moves that were rejected as illegal, in log order. */
  rejected: SignedMove[]
}

/** Rebuild the whole match from its seed and move log.
 *
 *  This is the only way match state is derived, on every device. Two clients
 *  holding the same log therefore agree exactly, including on dice, without
 *  any state ever being transmitted. */
export function replay(setup: MatchSetup, moves: readonly SignedMove[]): ReplayResult {
  let state = initialState(setup)
  const rejected: SignedMove[] = []

  const ordered = [...moves].sort((a, b) => a.seq - b.seq)
  for (const signed of ordered) {
    if (!isLegalMove(state, signed)) {
      rejected.push(signed)
      continue
    }
    state = applyMove(state, signed)
  }

  return { state, rejected }
}

/** The seat a given player occupies, or -1 if they are only watching. */
export function seatOf(setup: MatchSetup, playerId: string): number {
  return setup.players.find((p) => p.id === playerId)?.seat ?? -1
}

export function isMyTurn(state: GameState, seat: number): boolean {
  return state.phase !== 'gameOver' && state.currentPlayer === seat
}
