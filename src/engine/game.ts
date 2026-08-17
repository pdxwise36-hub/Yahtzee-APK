import { createRng, type Rng } from './rng'
import {
  ALL_CATEGORIES,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  UPPER_FACE,
  RULE_SETS,
  type CategoryId,
  type Die,
  type DieValue,
  type RuleSet,
  type UpperCategory,
  type VariantId,
} from './types'
import {
  columnTotals,
  faceCounts,
  isCardComplete,
  isFilled,
  isYahtzeeHand,
  scoreCategory,
  type ColumnTotals,
  type Scorecard,
} from './scoring'

export type AiLevel = 'easy' | 'medium' | 'hard' | 'expert'

export interface PlayerState {
  id: string
  name: string
  isAI: boolean
  aiLevel: AiLevel | null
  /** One scorecard per column. Classic has 1, Triple Yahtzee has 3. */
  cards: Scorecard[]
  /** Extra Yahtzees banked, per column. */
  yahtzeeBonuses: number[]
}

export type GamePhase = 'awaitingRoll' | 'rolling' | 'awaitingPick' | 'gameOver'

export interface TurnRecord {
  playerId: string
  turnNumber: number
  category: CategoryId
  column: number
  dice: DieValue[]
  score: number
  wasJoker: boolean
  yahtzeeBonus: boolean
}

export interface GameState {
  rules: RuleSet
  seed: number
  /** Serialised RNG position, so a saved game resumes with the same sequence. */
  rngState: number
  players: PlayerState[]
  currentPlayer: number
  dice: Die[]
  rollsUsed: number
  /** 0-based turn index for the current player. */
  turnNumber: number
  phase: GamePhase
  history: TurnRecord[]
  /** Set when the last roll produced a Yahtzee, for the celebration animation. */
  lastRollWasYahtzee: boolean
}

export interface PlayerConfig {
  id: string
  name: string
  isAI?: boolean
  aiLevel?: AiLevel
}

export function createGame(
  variant: VariantId,
  players: PlayerConfig[],
  seed: number,
): GameState {
  const rules = RULE_SETS[variant]
  return {
    rules,
    seed,
    rngState: seed >>> 0,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isAI: p.isAI ?? false,
      aiLevel: p.aiLevel ?? null,
      cards: Array.from({ length: rules.columns }, () => ({}) as Scorecard),
      yahtzeeBonuses: new Array<number>(rules.columns).fill(0),
    })),
    currentPlayer: 0,
    dice: Array.from({ length: rules.diceCount }, (_, i) => ({
      id: i,
      value: 1 as DieValue,
      held: false,
    })),
    rollsUsed: 0,
    turnNumber: 0,
    phase: 'awaitingRoll',
    history: [],
    lastRollWasYahtzee: false,
  }
}

export function currentPlayer(state: GameState): PlayerState {
  return state.players[state.currentPlayer] as PlayerState
}

export function diceValues(state: GameState): DieValue[] {
  return state.dice.map((d) => d.value)
}

export function totalTurns(rules: RuleSet): number {
  return ALL_CATEGORIES.length * rules.columns
}

export function canRoll(state: GameState): boolean {
  return state.phase === 'awaitingRoll' || (state.phase === 'awaitingPick' && state.rollsUsed < state.rules.rollsPerTurn)
}

/** Roll all unheld dice. On the first roll of a turn every die rolls.
 *  The engine is authoritative: the 3D physics is choreographed to land on
 *  these values, never the other way round. That keeps daily challenges and
 *  networked games perfectly reproducible from the seed alone. */
export function rollDice(state: GameState): GameState {
  if (!canRoll(state)) return state

  const rng: Rng = createRng(state.rngState)
  const firstRoll = state.rollsUsed === 0

  const dice = state.dice.map((die) =>
    firstRoll || !die.held ? { ...die, value: rng.die(), held: false } : { ...die },
  )

  const rollsUsed = state.rollsUsed + 1
  const values = dice.map((d) => d.value)

  return {
    ...state,
    dice,
    rngState: rng.getState(),
    rollsUsed,
    phase: 'awaitingPick',
    lastRollWasYahtzee: isYahtzeeHand(values),
  }
}

export function toggleHold(state: GameState, dieId: number): GameState {
  // Holding only means something once there is a roll to hold onto, and never
  // after the final roll has been spent.
  if (state.rollsUsed === 0 || state.phase !== 'awaitingPick') return state
  if (state.rollsUsed >= state.rules.rollsPerTurn) return state
  return {
    ...state,
    dice: state.dice.map((d) => (d.id === dieId ? { ...d, held: !d.held } : d)),
  }
}

export interface JokerState {
  /** The hand is a Yahtzee and the Yahtzee box is already resolved. */
  active: boolean
  /** Whether this Yahtzee earns the 100-point bonus. */
  earnsBonus: boolean
  face: DieValue | null
}

export function jokerState(
  values: readonly DieValue[],
  card: Scorecard,
): JokerState {
  if (!isYahtzeeHand(values)) return { active: false, earnsBonus: false, face: null }
  if (!isFilled(card, 'yahtzee')) return { active: false, earnsBonus: false, face: null }
  const counts = faceCounts(values)
  let face: DieValue | null = null
  for (let f = 1; f <= 6; f++) {
    if ((counts[f] ?? 0) >= 5) face = f as DieValue
  }
  return { active: true, earnsBonus: card.yahtzee === 50, face }
}

/** Categories the current hand may legally be scored into.
 *
 *  Ordinarily that is every unfilled box. The forced-joker rule narrows it:
 *  an extra Yahtzee must go in its matching upper box if that box is open;
 *  otherwise any open lower box; and only if the whole lower section is full
 *  may it be dumped as a zero in the upper section. */
export function legalCategories(
  values: readonly DieValue[],
  card: Scorecard,
  rules: RuleSet,
): CategoryId[] {
  const open = ALL_CATEGORIES.filter((c) => !isFilled(card, c))
  if (!rules.jokerRules) return open

  const joker = jokerState(values, card)
  if (!joker.active || joker.face === null) return open

  const matchingUpper = UPPER_CATEGORIES.find(
    (c) => UPPER_FACE[c] === joker.face,
  ) as UpperCategory | undefined

  if (matchingUpper && !isFilled(card, matchingUpper)) return [matchingUpper]

  const openLower = LOWER_CATEGORIES.filter((c) => !isFilled(card, c))
  if (openLower.length > 0) return openLower

  return UPPER_CATEGORIES.filter((c) => !isFilled(card, c))
}

/** What each open category would pay for the current hand. Drives the
 *  preview numbers shown greyed-in on the scorecard. */
export function previewScores(
  values: readonly DieValue[],
  card: Scorecard,
  rules: RuleSet,
): Partial<Record<CategoryId, number>> {
  const legal = new Set(legalCategories(values, card, rules))
  const joker = jokerState(values, card)
  const preview: Partial<Record<CategoryId, number>> = {}
  for (const category of ALL_CATEGORIES) {
    if (!legal.has(category)) continue
    preview[category] = scoreCategory(category, values, rules, joker.active)
  }
  return preview
}

export interface ScoreResult {
  state: GameState
  score: number
  wasJoker: boolean
  yahtzeeBonus: boolean
}

/** Commit the current hand to a category and advance the turn. */
export function scoreSelection(
  state: GameState,
  category: CategoryId,
  column = 0,
): ScoreResult {
  const player = currentPlayer(state)
  const card = player.cards[column] as Scorecard
  const values = diceValues(state)

  if (state.phase !== 'awaitingPick' || isFilled(card, category)) {
    return { state, score: 0, wasJoker: false, yahtzeeBonus: false }
  }
  if (!legalCategories(values, card, state.rules).includes(category)) {
    return { state, score: 0, wasJoker: false, yahtzeeBonus: false }
  }

  const joker = jokerState(values, card)
  const score = scoreCategory(category, values, state.rules, joker.active)
  const earnsBonus = joker.active && joker.earnsBonus

  const nextCards = player.cards.map((c, i) =>
    i === column ? { ...c, [category]: score } : c,
  )
  const nextBonuses = player.yahtzeeBonuses.map((b, i) =>
    i === column && earnsBonus ? b + 1 : b,
  )

  const players = state.players.map((p, i) =>
    i === state.currentPlayer
      ? { ...p, cards: nextCards, yahtzeeBonuses: nextBonuses }
      : p,
  )

  const record: TurnRecord = {
    playerId: player.id,
    turnNumber: state.turnNumber,
    category,
    column,
    dice: values,
    score,
    wasJoker: joker.active,
    yahtzeeBonus: earnsBonus,
  }

  const everyoneDone = players.every((p) => p.cards.every(isCardComplete))
  const isLastPlayer = state.currentPlayer === state.players.length - 1

  const next: GameState = {
    ...state,
    players,
    history: [...state.history, record],
    currentPlayer: isLastPlayer ? 0 : state.currentPlayer + 1,
    turnNumber: isLastPlayer ? state.turnNumber + 1 : state.turnNumber,
    dice: state.dice.map((d) => ({ ...d, held: false })),
    rollsUsed: 0,
    lastRollWasYahtzee: false,
    phase: everyoneDone ? 'gameOver' : 'awaitingRoll',
  }

  return { state: next, score, wasJoker: joker.active, yahtzeeBonus: earnsBonus }
}

/** Columns this player still has boxes free in. */
export function openColumns(player: PlayerState): number[] {
  return player.cards
    .map((card, i) => (isCardComplete(card) ? -1 : i))
    .filter((i) => i >= 0)
}

/** The column a move should actually be scored into.
 *
 *  Honours the player's choice while it is still playable, and otherwise
 *  falls back to a column with boxes free. Without this a multi-column game
 *  can strand a player on a finished card with no legal move anywhere and no
 *  way to end the game. */
export function resolveColumn(player: PlayerState, preferred: number): number {
  const card = player.cards[preferred]
  if (card && !isCardComplete(card)) return preferred
  return openColumns(player)[0] ?? preferred
}

export function playerTotals(player: PlayerState, rules: RuleSet): ColumnTotals[] {
  return player.cards.map((card, i) =>
    columnTotals(card, rules, player.yahtzeeBonuses[i] ?? 0, rules.columnMultipliers[i] ?? 1),
  )
}

export function grandTotal(player: PlayerState, rules: RuleSet): number {
  return playerTotals(player, rules).reduce((sum, t) => sum + t.total, 0)
}

export interface Standing {
  player: PlayerState
  total: number
  rank: number
}

export function standings(state: GameState): Standing[] {
  const scored = state.players.map((player) => ({
    player,
    total: grandTotal(player, state.rules),
  }))
  scored.sort((a, b) => b.total - a.total)
  let rank = 0
  let lastTotal = Number.NaN
  return scored.map((entry, i) => {
    if (entry.total !== lastTotal) {
      rank = i + 1
      lastTotal = entry.total
    }
    return { ...entry, rank }
  })
}
