import { initializeApp, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  type Auth,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore'
import type { CategoryId, VariantId } from '@/engine/types'
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

export interface FirebaseConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
  /** Names the underlying Firebase app. Only needed to run two independent
   *  clients in one process, which the integration check does to play both
   *  sides of a match. */
  instanceName?: string
}

interface MatchDoc {
  code: string
  hostId: string
  variant: VariantId
  seed: number
  status: MatchStatus
  playerCount: number
}

interface PlayerDoc {
  name: string
  seat: number
}

interface MoveDoc {
  seq: number
  seat: number
  type: 'roll' | 'hold' | 'score'
  payload: Record<string, unknown>
}

/** Sequence numbers are the document id, zero padded so they also sort
 *  correctly as strings. Making the sequence the id is what gives
 *  first-writer-wins: a second write to the same id is an update, and updates
 *  are refused outright. */
function moveId(seq: number): string {
  return String(seq).padStart(6, '0')
}

function toSignedMove(row: MoveDoc): SignedMove {
  switch (row.type) {
    case 'roll':
      return { seq: row.seq, seat: row.seat, move: { type: 'roll' } }
    case 'hold':
      return { seq: row.seq, seat: row.seat, move: { type: 'hold', dieId: Number(row.payload.dieId) } }
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

/** Firestore backend.
 *
 *  The join code is the match's document id, so joining is a direct lookup
 *  rather than a query, and the code is unique because a document id is. */
export class FirebaseTransport implements Transport {
  private readonly app: FirebaseApp
  private readonly db: Firestore
  private readonly auth: Auth

  constructor(config: FirebaseConfig) {
    const { instanceName, ...options } = config
    this.app = instanceName ? initializeApp(options, instanceName) : initializeApp(options)
    this.db = getFirestore(this.app)
    this.auth = getAuth(this.app)
  }

  async ensureSession(): Promise<string> {
    const existing = this.auth.currentUser
    if (existing) return existing.uid

    // A session restored from storage arrives asynchronously, so wait for the
    // first auth state before deciding to sign in again.
    const restored = await new Promise<string | null>((resolve) => {
      const stop = onAuthStateChanged(this.auth, (user) => {
        stop()
        resolve(user?.uid ?? null)
      })
    })
    if (restored) return restored

    const credential = await signInAnonymously(this.auth)
    return credential.user.uid
  }

  private matchRef(matchId: string) {
    return doc(this.db, 'matches', matchId)
  }

  private playersRef(matchId: string) {
    return collection(this.db, 'matches', matchId, 'players')
  }

  private movesRef(matchId: string) {
    return collection(this.db, 'matches', matchId, 'moves')
  }

  async createMatch(options: {
    variant: VariantId
    seed: number
    host: { id: string; name: string }
  }): Promise<MatchSetup> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateCode()
      const created = await runTransaction(this.db, async (tx) => {
        const ref = this.matchRef(code)
        const existing = await tx.get(ref)
        if (existing.exists()) return false

        const match: MatchDoc = {
          code,
          hostId: options.host.id,
          variant: options.variant,
          seed: options.seed,
          status: 'lobby',
          playerCount: 1,
        }
        tx.set(ref, { ...match, createdAt: serverTimestamp() })
        tx.set(doc(this.playersRef(code), options.host.id), {
          name: options.host.name,
          seat: 0,
          joinedAt: serverTimestamp(),
        })
        return true
      })

      if (created) {
        return {
          matchId: code,
          code,
          variant: options.variant,
          seed: options.seed,
          hostId: options.host.id,
          players: [{ id: options.host.id, name: options.host.name, seat: 0 }],
        }
      }
    }
    throw new Error('Could not allocate a free join code')
  }

  async joinMatch(code: string, player: { id: string; name: string }): Promise<MatchSetup> {
    const matchId = normaliseCode(code)

    // Seats come from a counter on the match document, and the transaction
    // both reads and writes it, so two players joining at once cannot be
    // handed the same seat.
    await runTransaction(this.db, async (tx) => {
      const matchSnap = await tx.get(this.matchRef(matchId))
      if (!matchSnap.exists()) throw new Error('No match with that code')
      const match = matchSnap.data() as MatchDoc

      const playerRef = doc(this.playersRef(matchId), player.id)
      const playerSnap = await tx.get(playerRef)
      // Rejoining a match already in progress is fine; taking a new seat is not.
      if (playerSnap.exists()) return
      if (match.status !== 'lobby') throw new Error('That match has already started')

      tx.set(playerRef, {
        name: player.name,
        seat: match.playerCount,
        joinedAt: serverTimestamp(),
      })
      tx.update(this.matchRef(matchId), { playerCount: match.playerCount + 1 })
    })

    return (await this.getSnapshot(matchId)).setup
  }

  async startMatch(matchId: string): Promise<void> {
    await runTransaction(this.db, async (tx) => {
      const ref = this.matchRef(matchId)
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('No such match')
      if ((snap.data() as MatchDoc).status !== 'lobby') return
      tx.update(ref, { status: 'playing' })
    })
  }

  async getSnapshot(matchId: string): Promise<MatchSnapshot> {
    const [matchSnap, playersSnap, movesSnap] = await Promise.all([
      getDoc(this.matchRef(matchId)),
      getDocs(this.playersRef(matchId)),
      getDocs(query(this.movesRef(matchId), orderBy('seq'))),
    ])
    if (!matchSnap.exists()) throw new Error('No such match')
    const match = matchSnap.data() as MatchDoc

    const players: MatchPlayer[] = playersSnap.docs
      .map((snap) => {
        const data = snap.data() as PlayerDoc
        return { id: snap.id, name: data.name, seat: data.seat }
      })
      .sort((a, b) => a.seat - b.seat)

    return {
      setup: {
        matchId,
        code: match.code,
        variant: match.variant,
        seed: match.seed,
        hostId: match.hostId,
        players,
      },
      status: match.status,
      moves: movesSnap.docs.map((snap) => toSignedMove(snap.data() as MoveDoc)),
    }
  }

  async submitMove(matchId: string, signed: SignedMove): Promise<SubmitResult> {
    try {
      const claimed = await runTransaction(this.db, async (tx) => {
        const ref = doc(this.movesRef(matchId), moveId(signed.seq))
        const existing = await tx.get(ref)
        if (existing.exists()) return false
        tx.set(ref, {
          seq: signed.seq,
          seat: signed.seat,
          type: signed.move.type,
          payload: toPayload(signed.move),
          createdAt: serverTimestamp(),
        })
        return true
      })

      // Losing the race for a sequence number is expected and recoverable.
      return claimed ? { ok: true } : { ok: false, conflict: true, reason: 'Sequence already taken' }
    } catch (error) {
      return { ok: false, reason: error instanceof Error ? error.message : String(error) }
    }
  }

  subscribe(
    matchId: string,
    handlers: {
      onMove?: (move: SignedMove) => void
      onPlayers?: (players: MatchPlayer[]) => void
      onStatus?: (status: MatchStatus) => void
    },
  ): () => void {
    const stopMoves = onSnapshot(query(this.movesRef(matchId), orderBy('seq')), (snap) => {
      for (const change of snap.docChanges()) {
        if (change.type === 'added') handlers.onMove?.(toSignedMove(change.doc.data() as MoveDoc))
      }
    })

    const stopPlayers = onSnapshot(this.playersRef(matchId), (snap) => {
      const players = snap.docs
        .map((row) => {
          const data = row.data() as PlayerDoc
          return { id: row.id, name: data.name, seat: data.seat }
        })
        .sort((a, b) => a.seat - b.seat)
      handlers.onPlayers?.(players)
    })

    const stopMatch = onSnapshot(this.matchRef(matchId), (snap) => {
      if (snap.exists()) handlers.onStatus?.((snap.data() as MatchDoc).status)
    })

    return () => {
      stopMoves()
      stopPlayers()
      stopMatch()
    }
  }
}
