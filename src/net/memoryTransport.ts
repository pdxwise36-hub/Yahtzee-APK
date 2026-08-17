import { createRng } from '@/engine/rng'
import {
  generateCode,
  normaliseCode,
  type MatchPlayer,
  type MatchSetup,
  type MatchSnapshot,
  type MatchStatus,
  type SignedMove,
  type SubmitResult,
  type Transport,
} from './protocol'

interface Room {
  setup: MatchSetup
  status: MatchStatus
  moves: SignedMove[]
  listeners: Set<{
    onMove?: (move: SignedMove) => void
    onPlayers?: (players: MatchPlayer[]) => void
    onStatus?: (status: MatchStatus) => void
  }>
}

export interface MemoryTransportOptions {
  /** Simulated one-way delay in milliseconds, for exercising race conditions. */
  latencyMs?: number
  seed?: number
}

/** An in-process implementation of the same contract the real backend
 *  satisfies. Two clients can share one instance, which is what lets the
 *  multiplayer rules be tested end to end — including turn stealing and
 *  simultaneous submissions — without a network or a database. */
export class MemoryTransport implements Transport {
  private readonly rooms = new Map<string, Room>()
  private readonly byCode = new Map<string, string>()
  private readonly latency: number
  private readonly rng: ReturnType<typeof createRng>
  private counter = 0

  constructor(options: MemoryTransportOptions = {}) {
    this.latency = options.latencyMs ?? 0
    this.rng = createRng(options.seed ?? 1)
  }

  private async wait(): Promise<void> {
    if (this.latency <= 0) return
    await new Promise((resolve) => setTimeout(resolve, this.latency))
  }

  private room(matchId: string): Room {
    const room = this.rooms.get(matchId)
    if (!room) throw new Error(`No such match: ${matchId}`)
    return room
  }

  async createMatch(options: {
    variant: MatchSetup['variant']
    seed: number
    host: { id: string; name: string }
  }): Promise<MatchSetup> {
    await this.wait()
    const matchId = `m${++this.counter}`
    let code = generateCode(() => this.rng.next())
    while (this.byCode.has(code)) code = generateCode(() => this.rng.next())

    const setup: MatchSetup = {
      matchId,
      code,
      variant: options.variant,
      seed: options.seed,
      hostId: options.host.id,
      players: [{ id: options.host.id, name: options.host.name, seat: 0 }],
    }

    this.rooms.set(matchId, { setup, status: 'lobby', moves: [], listeners: new Set() })
    this.byCode.set(code, matchId)
    return structuredClone(setup)
  }

  async joinMatch(code: string, player: { id: string; name: string }): Promise<MatchSetup> {
    await this.wait()
    const matchId = this.byCode.get(normaliseCode(code))
    if (!matchId) throw new Error('No match with that code')
    const room = this.room(matchId)
    if (room.status !== 'lobby') throw new Error('That match has already started')

    const existing = room.setup.players.find((p) => p.id === player.id)
    if (!existing) {
      room.setup.players.push({
        id: player.id,
        name: player.name,
        seat: room.setup.players.length,
      })
      this.emit(room, (l) => l.onPlayers?.(structuredClone(room.setup.players)))
    }
    return structuredClone(room.setup)
  }

  async startMatch(matchId: string): Promise<void> {
    await this.wait()
    const room = this.room(matchId)
    room.status = 'playing'
    this.emit(room, (l) => l.onStatus?.('playing'))
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    await this.wait()
    const room = this.room(matchId)
    return structuredClone({ setup: room.setup, status: room.status, moves: room.moves })
  }

  async submitMove(matchId: string, signed: SignedMove): Promise<SubmitResult> {
    await this.wait()
    const room = this.room(matchId)

    // The sequence number is the concurrency guard: whoever writes it first
    // owns it, exactly as a primary key would in the database.
    if (room.moves.some((m) => m.seq === signed.seq)) {
      return { ok: false, conflict: true, reason: 'Sequence already taken' }
    }
    if (signed.seq !== room.moves.length) {
      return { ok: false, conflict: true, reason: 'Out of order' }
    }
    if (!room.setup.players.some((p) => p.seat === signed.seat)) {
      return { ok: false, reason: 'No such seat' }
    }

    const stored = structuredClone(signed)
    room.moves.push(stored)
    this.emit(room, (l) => l.onMove?.(structuredClone(stored)))
    return { ok: true }
  }

  subscribe(
    matchId: string,
    handlers: {
      onMove?: (move: SignedMove) => void
      onPlayers?: (players: MatchPlayer[]) => void
      onStatus?: (status: MatchStatus) => void
    },
  ): () => void {
    const room = this.room(matchId)
    room.listeners.add(handlers)
    return () => {
      room.listeners.delete(handlers)
    }
  }

  private emit(room: Room, fn: (listener: Room['listeners'] extends Set<infer L> ? L : never) => void): void {
    for (const listener of [...room.listeners]) fn(listener)
  }
}
