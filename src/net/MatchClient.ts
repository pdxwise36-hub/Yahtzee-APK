import type { GameState } from '@/engine/game'
import type { Move, MatchSetup, MatchStatus, SignedMove, Transport } from './protocol'
import { isLegalMove, isMyTurn, replay, seatOf } from './replay'

export interface MatchClientEvents {
  onChange?: (state: GameState) => void
  onPlayers?: (setup: MatchSetup) => void
  onStatus?: (status: MatchStatus) => void
}

const MAX_SUBMIT_ATTEMPTS = 5

/** One device's view of a networked match.
 *
 *  Holds the move log, derives the game state from it, and is the only thing
 *  that talks to the transport. State is never received from the network — it
 *  is always recomputed locally from the seed and the log, so a device that
 *  reconnects mid-game catches up simply by fetching the moves it missed. */
export class MatchClient {
  private setup: MatchSetup
  private moves: SignedMove[] = []
  private state: GameState
  private status: MatchStatus = 'lobby'
  private unsubscribe: (() => void) | null = null

  constructor(
    private readonly transport: Transport,
    setup: MatchSetup,
    private readonly playerId: string,
    private readonly events: MatchClientEvents = {},
  ) {
    this.setup = setup
    this.state = replay(setup, []).state
  }

  get gameState(): GameState {
    return this.state
  }

  get matchSetup(): MatchSetup {
    return this.setup
  }

  get matchStatus(): MatchStatus {
    return this.status
  }

  get seat(): number {
    return seatOf(this.setup, this.playerId)
  }

  get myTurn(): boolean {
    return isMyTurn(this.state, this.seat)
  }

  /** Pull everything that has happened and start listening for more. */
  async connect(): Promise<void> {
    const snapshot = await this.transport.getSnapshot(this.setup.matchId)
    this.setup = snapshot.setup
    this.status = snapshot.status
    this.moves = snapshot.moves
    this.recompute()
    this.events.onPlayers?.(this.setup)
    this.events.onStatus?.(this.status)

    this.unsubscribe = this.transport.subscribe(this.setup.matchId, {
      onMove: (move) => this.ingest(move),
      onPlayers: (players) => {
        this.setup = { ...this.setup, players }
        this.recompute()
        this.events.onPlayers?.(this.setup)
      },
      onStatus: (status) => {
        this.status = status
        this.events.onStatus?.(status)
      },
    })
  }

  dispose(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
  }

  /** Fold in a move arriving from the network. Moves the client already has,
   *  including its own echoed back, are ignored. */
  private ingest(move: SignedMove): void {
    if (this.moves.some((m) => m.seq === move.seq)) return
    this.moves.push(move)
    this.recompute()
  }

  private recompute(): void {
    this.state = replay(this.setup, this.moves).state
    this.events.onChange?.(this.state)
  }

  /** Send a move, retrying if another client claimed the sequence number
   *  first. On each retry the move is re-validated against the updated state,
   *  so a move that has been made irrelevant by what arrived in the meantime
   *  is dropped rather than forced through. */
  async send(move: Move): Promise<boolean> {
    for (let attempt = 0; attempt < MAX_SUBMIT_ATTEMPTS; attempt++) {
      const signed: SignedMove = { seq: this.moves.length, seat: this.seat, move }
      if (!isLegalMove(this.state, signed)) return false

      const result = await this.transport.submitMove(this.setup.matchId, signed)
      if (result.ok) {
        this.ingest(signed)
        return true
      }
      if (!result.conflict) return false

      // Someone else got there first: catch up and reconsider.
      const snapshot = await this.transport.getSnapshot(this.setup.matchId)
      this.moves = snapshot.moves
      this.setup = snapshot.setup
      this.recompute()
    }
    return false
  }
}
