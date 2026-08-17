import { create } from 'zustand'
import {
  createGame,
  currentPlayer,
  diceValues,
  jokerState,
  legalCategories,
  previewScores,
  rollDice,
  resolveColumn,
  scoreSelection,
  standings,
  toggleHold,
  type GameState,
  type PlayerConfig,
} from '@/engine/game'
import type { CategoryId, DieValue, VariantId } from '@/engine/types'
import { createRng, randomSeed } from '@/engine/rng'
import { aiColumn, aiHolds, aiMove } from '@/ai/autoplay'
import { generateRoll } from '@/dice3d/physicsRoll'
import type { MatchClient } from '@/net/MatchClient'
import type { DiceTable } from '@/dice3d/DiceTable'
import { ALL_CATEGORIES } from '@/engine/types'
import { upperBonus } from '@/engine/scoring'
import { DICE_SPEED_RATES, useProfileStore } from './profileStore'

export interface GameStore {
  game: GameState | null
  /** True while dice are physically in motion. Blocks input. */
  rolling: boolean
  /** Set when the roll that just landed was a Yahtzee, for the celebration. */
  celebrating: boolean
  /** True when that Yahtzee also earns the 100-point bonus, so the
   *  celebration can say so at the moment it happens. */
  celebratingBonus: boolean
  activeColumn: number
  table: DiceTable | null
  /** Set when the current game is the daily challenge, as YYYY-MM-DD. */
  dailyKey: string | null
  /** True while an AI opponent is taking its turn. */
  aiThinking: boolean
  /** Set when this game is a networked match rather than a local one. */
  match: MatchClient | null

  attachTable: (table: DiceTable | null) => void
  newGame: (
    variant: VariantId,
    players: PlayerConfig[],
    seed?: number,
    dailyKey?: string,
  ) => void
  roll: () => Promise<void>
  hold: (dieId: number) => void
  score: (category: CategoryId, column?: number) => void
  setActiveColumn: (column: number) => void
  dismissCelebration: () => void
  /** Play the current AI player's whole turn, at a watchable pace. */
  runAiTurn: () => Promise<void>
  /** Take over a networked match; null returns the store to local play. */
  setMatch: (match: MatchClient | null) => void
  /** Fold in state derived from the match's move log, animating any roll. */
  syncFromMatch: (next: GameState) => Promise<void>
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  rolling: false,
  celebrating: false,
  celebratingBonus: false,
  activeColumn: 0,
  table: null,
  dailyKey: null,
  aiThinking: false,
  match: null,

  attachTable: (table) => {
    set({ table })
    const game = get().game
    if (table && game) {
      table.setDiceCount(game.dice.length)
      if (game.rollsUsed > 0) table.showValues(diceValues(game))
      table.setHeld(game.dice.map((d) => d.held))
    }
  },

  newGame: (variant, players, seed, dailyKey) => {
    const game = createGame(variant, players, seed ?? randomSeed())
    set({ game, rolling: false, celebrating: false, activeColumn: 0, dailyKey: dailyKey ?? null })
    const table = get().table
    if (table) {
      table.setDiceCount(game.dice.length)
      table.setHeld(game.dice.map(() => false))
    }
  },

  roll: async () => {
    const { game, table, rolling, match } = get()
    if (!game || rolling) return

    // Online, a roll is a move for every device to replay rather than a local
    // mutation. The animation runs when the resulting state comes back.
    if (match) {
      await match.send({ type: 'roll' })
      return
    }

    const next = rollDice(game)
    if (next === game) return

    // Only dice that actually left the table are animated; held dice stay put.
    const movedIndices = game.dice
      .map((die, i) => (game.rollsUsed === 0 || !die.held ? i : -1))
      .filter((i) => i >= 0)
    const movedValues = movedIndices.map((i) => next.dice[i]?.value as DieValue)

    set({ rolling: true })

    if (table) {
      // The seed advances with the game's RNG, so a given game always throws
      // the dice along exactly the same arc.
      const animation = generateRoll(movedValues, next.rngState)
      await table.playRoll(animation, movedIndices)
      table.setHeld(next.dice.map((d) => d.held))
    }

    set({
      game: next,
      rolling: false,
      celebrating: next.lastRollWasYahtzee,
      celebratingBonus: earnsBonusFor(next),
    })
  },

  hold: (dieId) => {
    const { game, rolling, table, match } = get()
    if (!game || rolling) return
    if (match) {
      void match.send({ type: 'hold', dieId })
      return
    }
    const next = toggleHold(game, dieId)
    if (next === game) return
    table?.setHeld(next.dice.map((d) => d.held))
    set({ game: next })
  },

  score: (category, column) => {
    const { game, rolling, activeColumn, table, dailyKey, match } = get()
    if (!game || rolling) return
    const target = resolveColumn(currentPlayer(game), column ?? activeColumn)
    if (match) {
      void match.send({ type: 'score', category, column: target })
      return
    }
    const result = scoreSelection(game, category, target)
    if (result.state === game) return
    table?.setHeld(result.state.dice.map(() => false))
    set({ game: result.state, celebrating: false })

    if (result.state.phase === 'gameOver') {
      recordFinishedGame(result.state, dailyKey)
    } else {
      set({ activeColumn: resolveColumn(currentPlayer(result.state), get().activeColumn) })
    }
  },

  setMatch: (match) => {
    set({ match, dailyKey: null })
    if (match) {
      set({ game: match.gameState, rolling: false, celebrating: false, activeColumn: 0 })
      const table = get().table
      table?.setDiceCount(match.gameState.dice.length)
      table?.showValues(diceValues(match.gameState))
    }
  },

  /** Bring the local view up to a state derived from the move log.
   *
   *  A roll is animated exactly as a local one would be, whichever device made
   *  it, so watching an opponent's turn looks the same as taking your own.
   *  Everything else applies immediately. */
  syncFromMatch: async (next) => {
    const { game: prev, table } = get()

    const rolled =
      prev !== null &&
      next.rollsUsed > prev.rollsUsed &&
      next.turnNumber === prev.turnNumber &&
      next.currentPlayer === prev.currentPlayer

    if (!rolled || !table) {
      set({
        game: next,
        celebrating: next.lastRollWasYahtzee,
        celebratingBonus: earnsBonusFor(next),
      })
      table?.setHeld(next.dice.map((d) => d.held))
      if (!rolled) table?.showValues(diceValues(next))
      return
    }

    // Held dice keep their value and must not be thrown again.
    const movedIndices = prev.dice
      .map((die, i) => (prev.rollsUsed === 0 || !die.held ? i : -1))
      .filter((i) => i >= 0)
    const movedValues = movedIndices.map((i) => next.dice[i]?.value as DieValue)

    set({ rolling: true })
    await table.playRoll(generateRoll(movedValues, next.rngState), movedIndices)
    table.setHeld(next.dice.map((d) => d.held))
    set({
      game: next,
      rolling: false,
      celebrating: next.lastRollWasYahtzee,
      celebratingBonus: earnsBonusFor(next),
    })
  },

  setActiveColumn: (column) => set({ activeColumn: column }),
  dismissCelebration: () => set({ celebrating: false, celebratingBonus: false }),

  runAiTurn: async () => {
    const start = get().game
    if (!start || get().rolling || get().aiThinking) return
    if (!currentPlayer(start).isAI || start.phase !== 'awaitingRoll') return

    set({ aiThinking: true })
    try {
      // Derived from the game's own RNG position, so an AI opponent plays the
      // same way when a game is replayed from its seed.
      const rng = createRng((start.rngState ^ 0x9e3779b9) >>> 0)

      await get().roll()

      let state = get().game
      if (!state) return
      const column = aiColumn(state, rng)

      while (state.rollsUsed < state.rules.rollsPerTurn) {
        const holds = aiHolds(state, rng, column)
        // Keeping everything means there is nothing worth rerolling.
        if (holds.every(Boolean)) break

        holds.forEach((hold, i) => {
          const die = get().game?.dice[i]
          if (die && die.held !== hold) get().hold(die.id)
        })
        // A beat so the player can see which dice the opponent kept, scaled
        // with the dice speed so a fast game stays fast throughout.
        await delay(650 / aiPace())

        await get().roll()
        state = get().game
        if (!state) return
      }

      await delay(700 / aiPace())
      const move = aiMove(state, rng)
      get().score(move.category, move.column)
    } finally {
      set({ aiThinking: false })
    }
  },
}))

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Pacing multiplier for AI pauses. Instant dice still leave a short beat so
 *  the opponent's turn does not flash past unread. */
function aiPace(): number {
  const rate = DICE_SPEED_RATES[useProfileStore.getState().diceSpeed]
  return rate === 0 ? 3 : rate
}

/** Whether the hand on the table is a Yahtzee that also banks the bonus.
 *
 *  Known at the moment it lands rather than when it is scored, so the
 *  celebration can announce the hundred points as they are earned. */
function earnsBonusFor(state: GameState): boolean {
  if (!state.lastRollWasYahtzee) return false
  const player = state.players[state.currentPlayer]
  if (!player) return false
  return player.cards.some((card) => jokerState(diceValues(state), card).earnsBonus)
}

/** Fold a finished game into the player's lifetime record.
 *
 *  The human player is always seat zero, so their card is what counts towards
 *  personal stats even in a game full of AI opponents. */
function recordFinishedGame(state: GameState, dailyKey: string | null): void {
  const human = state.players.find((p) => !p.isAI) ?? state.players[0]
  if (!human) return

  const table = standings(state)
  const won = table[0]?.player.id === human.id

  const categoryScores: Partial<Record<CategoryId, number>> = {}
  let yahtzees = 0
  let earnedUpperBonus = false

  human.cards.forEach((card, column) => {
    for (const category of ALL_CATEGORIES) {
      const score = card[category]
      if (score === undefined) continue
      if (score > (categoryScores[category] ?? -1)) categoryScores[category] = score
    }
    if (card.yahtzee === 50) yahtzees += 1
    yahtzees += human.yahtzeeBonuses[column] ?? 0
    if (upperBonus(card, state.rules) > 0) earnedUpperBonus = true
  })

  useProfileStore.getState().recordGame({
    score: table.find((entry) => entry.player.id === human.id)?.total ?? 0,
    won,
    yahtzees,
    earnedUpperBonus,
    variant: state.rules.id,
    categoryScores,
    ...(dailyKey ? { dailyKey } : {}),
  })
}

/** Everything the scorecard needs for the current hand, derived in one place. */
export function useTurnView() {
  const game = useGameStore((s) => s.game)
  const rolling = useGameStore((s) => s.rolling)
  const activeColumn = useGameStore((s) => s.activeColumn)

  if (!game) return null

  const player = currentPlayer(game)
  const column = resolveColumn(player, activeColumn)
  const card = player.cards[column] ?? {}
  const values = diceValues(game)
  const hasHand = game.rollsUsed > 0 && !rolling

  return {
    game,
    player,
    card,
    values,
    rolling,
    activeColumn: column,
    rollsLeft: game.rules.rollsPerTurn - game.rollsUsed,
    preview: hasHand ? previewScores(values, card, game.rules) : {},
    legal: hasHand ? new Set(legalCategories(values, card, game.rules)) : new Set<CategoryId>(),
    standings: standings(game),
  }
}
