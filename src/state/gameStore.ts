import { create } from 'zustand'
import {
  createGame,
  currentPlayer,
  diceValues,
  legalCategories,
  previewScores,
  rollDice,
  scoreSelection,
  standings,
  toggleHold,
  type GameState,
  type PlayerConfig,
} from '@/engine/game'
import type { CategoryId, DieValue, VariantId } from '@/engine/types'
import { randomSeed } from '@/engine/rng'
import { generateRoll } from '@/dice3d/physicsRoll'
import type { DiceTable } from '@/dice3d/DiceTable'
import { ALL_CATEGORIES } from '@/engine/types'
import { upperBonus } from '@/engine/scoring'
import { useProfileStore } from './profileStore'

export interface GameStore {
  game: GameState | null
  /** True while dice are physically in motion. Blocks input. */
  rolling: boolean
  /** Set when the roll that just landed was a Yahtzee, for the celebration. */
  celebrating: boolean
  activeColumn: number
  table: DiceTable | null
  /** Set when the current game is the daily challenge, as YYYY-MM-DD. */
  dailyKey: string | null

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
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  rolling: false,
  celebrating: false,
  activeColumn: 0,
  table: null,
  dailyKey: null,

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
    const { game, table, rolling } = get()
    if (!game || rolling) return

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
    })
  },

  hold: (dieId) => {
    const { game, rolling, table } = get()
    if (!game || rolling) return
    const next = toggleHold(game, dieId)
    if (next === game) return
    table?.setHeld(next.dice.map((d) => d.held))
    set({ game: next })
  },

  score: (category, column) => {
    const { game, rolling, activeColumn, table, dailyKey } = get()
    if (!game || rolling) return
    const result = scoreSelection(game, category, column ?? activeColumn)
    if (result.state === game) return
    table?.setHeld(result.state.dice.map(() => false))
    set({ game: result.state, celebrating: false })

    if (result.state.phase === 'gameOver') {
      recordFinishedGame(result.state, dailyKey)
    }
  },

  setActiveColumn: (column) => set({ activeColumn: column }),
  dismissCelebration: () => set({ celebrating: false }),
}))

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
  const card = player.cards[activeColumn] ?? {}
  const values = diceValues(game)
  const hasHand = game.rollsUsed > 0 && !rolling

  return {
    game,
    player,
    card,
    values,
    rolling,
    activeColumn,
    rollsLeft: game.rules.rollsPerTurn - game.rollsUsed,
    preview: hasHand ? previewScores(values, card, game.rules) : {},
    legal: hasHand ? new Set(legalCategories(values, card, game.rules)) : new Set<CategoryId>(),
    standings: standings(game),
  }
}
