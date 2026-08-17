import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { CategoryId, VariantId } from '@/engine/types'
import {
  normaliseCode,
  type MatchPlayer,
  type MatchSetup,
  type MatchSnapshot,
  type MatchStatus,
  type SignedMove,
  type SubmitResult,
  type Transport,
} from './protocol'

interface MatchRow {
  id: string
  code: string
  host_id: string
  variant: VariantId
  seed: number
  status: MatchStatus
}

interface PlayerRow {
  player_id: string
  name: string
  seat: number
}

interface MoveRow {
  seq: number
  seat: number
  type: 'roll' | 'hold' | 'score'
  payload: Record<string, unknown>
}

function toSignedMove(row: MoveRow): SignedMove {
  switch (row.type) {
    case 'roll':
      return { seq: row.seq, seat: row.seat, move: { type: 'roll' } }
    case 'hold':
      return {
        seq: row.seq,
        seat: row.seat,
        move: { type: 'hold', dieId: Number(row.payload.dieId) },
      }
    case 'score':
      return {
        seq: row.seq,
        seat: row.seat,
        move: {
          type: 'score',
          category: row.payload.category as CategoryId,
          column: Number(row.payload.column),
        },
      }
  }
}

function toPayload(move: SignedMove['move']): Record<string, unknown> {
  switch (move.type) {
    case 'roll':
      return {}
    case 'hold':
      return { dieId: move.dieId }
    case 'score':
      return { category: move.category, column: move.column }
  }
}

function toSetup(match: MatchRow, players: PlayerRow[]): MatchSetup {
  return {
    matchId: match.id,
    code: match.code,
    variant: match.variant,
    seed: Number(match.seed),
    hostId: match.host_id,
    players: players
      .map<MatchPlayer>((p) => ({ id: p.player_id, name: p.name, seat: p.seat }))
      .sort((a, b) => a.seat - b.seat),
  }
}

/** Postgres unique-violation, which is how a lost race for a sequence number
 *  surfaces: the primary key on (match_id, seq) is the concurrency guard. */
const UNIQUE_VIOLATION = '23505'

export interface SupabaseConfig {
  url: string
  anonKey: string
}

/** The real backend. Deliberately thin: it moves rows, and never interprets
 *  the game. All rules live in the engine, which every client runs. */
export class SupabaseTransport implements Transport {
  private readonly client: SupabaseClient

  constructor(config: SupabaseConfig) {
    this.client = createClient(config.url, config.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }

  /** Players get a durable identity without ever signing up. */
  async ensureSession(): Promise<string> {
    const { data } = await this.client.auth.getSession()
    if (data.session?.user.id) return data.session.user.id
    const { data: created, error } = await this.client.auth.signInAnonymously()
    if (error || !created.user) throw error ?? new Error('Could not start a session')
    return created.user.id
  }

  private schema() {
    return this.client.schema('yahtzee')
  }

  async createMatch(options: {
    variant: VariantId
    seed: number
    host: { id: string; name: string }
  }): Promise<MatchSetup> {
    const { data, error } = await this.schema().rpc('create_match', {
      p_variant: options.variant,
      p_seed: options.seed,
      p_name: options.host.name,
    })
    if (error) throw error
    const match = data as MatchRow
    return toSetup(match, [{ player_id: options.host.id, name: options.host.name, seat: 0 }])
  }

  async joinMatch(code: string, player: { id: string; name: string }): Promise<MatchSetup> {
    const { data, error } = await this.schema().rpc('join_match', {
      p_code: normaliseCode(code),
      p_name: player.name,
    })
    if (error) throw error
    const match = data as MatchRow
    const snapshot = await this.getSnapshot(match.id)
    return snapshot.setup
  }

  async startMatch(matchId: string): Promise<void> {
    const { error } = await this.schema().rpc('start_match', { p_match: matchId })
    if (error) throw error
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const [match, players, moves] = await Promise.all([
      this.schema().from('matches').select('*').eq('id', matchId).single(),
      this.schema().from('match_players').select('player_id,name,seat').eq('match_id', matchId),
      this.schema().from('match_moves').select('seq,seat,type,payload').eq('match_id', matchId)
        .order('seq', { ascending: true }),
    ])
    if (match.error) throw match.error
    if (players.error) throw players.error
    if (moves.error) throw moves.error

    const row = match.data as MatchRow
    return {
      setup: toSetup(row, (players.data ?? []) as PlayerRow[]),
      status: row.status,
      moves: ((moves.data ?? []) as MoveRow[]).map(toSignedMove),
    }
  }

  async submitMove(matchId: string, signed: SignedMove): Promise<SubmitResult> {
    const { error } = await this.schema().from('match_moves').insert({
      match_id: matchId,
      seq: signed.seq,
      seat: signed.seat,
      type: signed.move.type,
      payload: toPayload(signed.move),
    })

    if (!error) return { ok: true }
    // Losing the race for a sequence number is expected and recoverable; the
    // caller catches up and tries the next slot.
    if (error.code === UNIQUE_VIOLATION) {
      return { ok: false, conflict: true, reason: 'Sequence already taken' }
    }
    return { ok: false, reason: error.message }
  }

  subscribe(
    matchId: string,
    handlers: {
      onMove?: (move: SignedMove) => void
      onPlayers?: (players: MatchPlayer[]) => void
      onStatus?: (status: MatchStatus) => void
    },
  ): () => void {
    const channel = this.client
      .channel(`match:${matchId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'yahtzee', table: 'match_moves', filter: `match_id=eq.${matchId}` },
        (payload) => handlers.onMove?.(toSignedMove(payload.new as MoveRow)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'yahtzee', table: 'match_players', filter: `match_id=eq.${matchId}` },
        () => {
          void this.getSnapshot(matchId).then((s) => handlers.onPlayers?.(s.setup.players))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'yahtzee', table: 'matches', filter: `id=eq.${matchId}` },
        (payload) => handlers.onStatus?.((payload.new as MatchRow).status),
      )
      .subscribe()

    return () => {
      void this.client.removeChannel(channel)
    }
  }
}

/** Reads configuration from the build environment. Returns null when the app
 *  has not been pointed at a backend, which is what keeps online play cleanly
 *  optional rather than a hard dependency. */
export function supabaseConfigFromEnv(): SupabaseConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (!url || !anonKey) return null
  return { url, anonKey }
}
