import type { CategoryId, VariantId } from '@/engine/types'

/** The wire format for a networked match.
 *
 *  Dice values are never sent. The rules engine is deterministic and seeded,
 *  so every device replaying the same move log from the same seed derives the
 *  identical hand on every roll. That makes desynchronised dice impossible by
 *  construction, keeps each message to a few bytes, and means a cheating
 *  client cannot invent a better roll: the dice are a function of the seed and
 *  the moves, not of anything a player sends. */
export type Move =
  | { type: 'roll' }
  | { type: 'hold'; dieId: number }
  | { type: 'score'; category: CategoryId; column: number }

export interface SignedMove {
  /** Position in the match's move log, starting at 0 and strictly increasing.
   *  Doubles as the optimistic-concurrency token: two clients racing for the
   *  same sequence number cannot both win. */
  seq: number
  /** Seat of the player who made the move. */
  seat: number
  move: Move
}

export interface MatchPlayer {
  id: string
  name: string
  seat: number
}

export interface MatchSetup {
  matchId: string
  /** Short human-shareable join code. */
  code: string
  variant: VariantId
  seed: number
  players: MatchPlayer[]
  hostId: string
}

export type MatchStatus = 'lobby' | 'playing' | 'finished'

export interface MatchSnapshot {
  setup: MatchSetup
  status: MatchStatus
  moves: SignedMove[]
}

export interface SubmitResult {
  ok: boolean
  /** Set when another client already claimed this sequence number. The caller
   *  should pull the missing moves and reconsider. */
  conflict?: boolean
  reason?: string
}

/** What the game needs from a backend. Kept deliberately small so the
 *  Supabase implementation and the in-memory one used by tests are
 *  interchangeable, and so a different backend could be dropped in later. */
export interface Transport {
  createMatch(options: {
    variant: VariantId
    seed: number
    host: { id: string; name: string }
  }): Promise<MatchSetup>

  joinMatch(code: string, player: { id: string; name: string }): Promise<MatchSetup>

  startMatch(matchId: string): Promise<void>

  getSnapshot(matchId: string): Promise<MatchSnapshot>

  submitMove(matchId: string, signed: SignedMove): Promise<SubmitResult>

  /** Establish a durable identity, where the backend has a notion of one.
   *  Absent on transports that do not authenticate. */
  ensureSession?: () => Promise<string>

  /** Live updates. Returns an unsubscribe function. */
  subscribe(
    matchId: string,
    handlers: {
      onMove?: (move: SignedMove) => void
      onPlayers?: (players: MatchPlayer[]) => void
      onStatus?: (status: MatchStatus) => void
    },
  ): () => void
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** A short join code. Ambiguous characters (0/O, 1/I) are left out so a code
 *  can be read aloud or typed without confusion. */
export function generateCode(random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]
  }
  return code
}

export function normaliseCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}
