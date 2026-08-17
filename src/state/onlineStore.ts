import { create } from 'zustand'
import type { VariantId } from '@/engine/types'
import { randomSeed } from '@/engine/rng'
import { MatchClient } from '@/net/MatchClient'
import { MemoryTransport } from '@/net/memoryTransport'
import type { MatchSetup, MatchStatus, Transport } from '@/net/protocol'
import { useGameStore } from './gameStore'

const PLAYER_KEY = 'yahtzee.playerId'
const RECENT_KEY = 'yahtzee.recentMatches'
const RECENT_LIMIT = 8

/** A match this device has taken part in, kept so it can be picked up again.
 *  Only the identifiers are stored: the match itself is always rebuilt from
 *  the backend's move log, never from anything cached here. */
export interface RecentMatch {
  matchId: string
  code: string
  variant: VariantId
  /** Epoch millis of the last time this device joined or hosted it. */
  lastPlayed: number
  opponents: string[]
}

function loadRecent(): RecentMatch[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentMatch[]
    return Array.isArray(parsed) ? parsed.slice(0, RECENT_LIMIT) : []
  } catch {
    return []
  }
}

function saveRecent(matches: RecentMatch[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(matches.slice(0, RECENT_LIMIT)))
  } catch {
    // Losing the list costs the player a shortcut, not a game.
  }
}

function localPlayerId(): string {
  try {
    const existing = localStorage.getItem(PLAYER_KEY)
    if (existing) return existing
    const created = crypto.randomUUID()
    localStorage.setItem(PLAYER_KEY, created)
    return created
  } catch {
    return crypto.randomUUID()
  }
}

// Read as flat constants, not into an object. Vite substitutes each
// `import.meta.env` reference with a literal at build time, and the bundler
// can only fold that away and drop the unused backend when the value is used
// directly. Reading them through an object defeats it, and both SDKs get
// bundled as unreachable chunks.
const FIREBASE_API_KEY = import.meta.env.VITE_FIREBASE_API_KEY
const FIREBASE_AUTH_DOMAIN = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
const FIREBASE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID
const FIREBASE_APP_ID = import.meta.env.VITE_FIREBASE_APP_ID
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/** Whether a real backend is configured. When one is not, the lobby still
 *  opens against an in-process stand-in so the flow can be inspected, and
 *  says plainly that another device cannot join rather than failing later. */
export const isOnlineConfigured = Boolean(
  (FIREBASE_API_KEY && FIREBASE_AUTH_DOMAIN && FIREBASE_PROJECT_ID && FIREBASE_APP_ID) ||
    (SUPABASE_URL && SUPABASE_ANON_KEY),
)

let transportPromise: Promise<Transport> | null = null

/** The backend client is imported only when online play is actually used, so
 *  its SDK stays out of the main bundle for everyone who never opens the
 *  lobby, and drops out of the build entirely when nothing is configured. */
async function getTransport(): Promise<Transport> {
  if (!transportPromise) {
    if (FIREBASE_API_KEY && FIREBASE_AUTH_DOMAIN && FIREBASE_PROJECT_ID && FIREBASE_APP_ID) {
      transportPromise = import('@/net/firebaseTransport').then(
        (module) =>
          new module.FirebaseTransport({
            apiKey: FIREBASE_API_KEY,
            authDomain: FIREBASE_AUTH_DOMAIN,
            projectId: FIREBASE_PROJECT_ID,
            appId: FIREBASE_APP_ID,
          }),
      )
    } else if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      transportPromise = import('@/net/supabaseTransport').then(
        (module) => new module.SupabaseTransport({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY }),
      )
    } else {
      transportPromise = Promise.resolve(new MemoryTransport())
    }
  }
  return transportPromise
}

export interface OnlineStore {
  playerId: string
  playerName: string
  setup: MatchSetup | null
  status: MatchStatus
  client: MatchClient | null
  busy: boolean
  error: string | null
  recent: RecentMatch[]

  setPlayerName: (name: string) => void
  forget: (matchId: string) => void
  host: (variant: VariantId) => Promise<void>
  join: (code: string) => Promise<void>
  start: () => Promise<void>
  leave: () => void
}

export const useOnlineStore = create<OnlineStore>((set, get) => ({
  playerId: localPlayerId(),
  playerName: 'You',
  setup: null,
  status: 'lobby',
  client: null,
  busy: false,
  error: null,
  recent: loadRecent(),

  setPlayerName: (name) => set({ playerName: name.slice(0, 16) }),

  forget: (matchId) => {
    const remaining = get().recent.filter((m) => m.matchId !== matchId)
    saveRecent(remaining)
    set({ recent: remaining })
  },

  host: async (variant) => {
    set({ busy: true, error: null })
    try {
      const transport = await getTransport()
      const playerId = await resolveIdentity(transport, get().playerId)
      const setup = await transport.createMatch({
        variant,
        seed: randomSeed(),
        host: { id: playerId, name: get().playerName },
      })
      await attach(transport, setup, playerId, set)
      remember(setup, playerId, set)
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ busy: false })
    }
  },

  join: async (code) => {
    set({ busy: true, error: null })
    try {
      const transport = await getTransport()
      const playerId = await resolveIdentity(transport, get().playerId)
      const setup = await transport.joinMatch(code, {
        id: playerId,
        name: get().playerName,
      })
      await attach(transport, setup, playerId, set)
      remember(setup, playerId, set)
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ busy: false })
    }
  },

  start: async () => {
    const { setup } = get()
    if (!setup) return
    set({ busy: true, error: null })
    try {
      const transport = await getTransport()
      await transport.startMatch(setup.matchId)
    } catch (error) {
      set({ error: messageOf(error) })
    } finally {
      set({ busy: false })
    }
  },

  leave: () => {
    get().client?.dispose()
    useGameStore.getState().setMatch(null)
    set({ client: null, setup: null, status: 'lobby', error: null })
  },
}))

/** Anonymous sign-in gives a durable identity on a real backend; the local
 *  stand-in just reuses the id stored on this device. */
async function resolveIdentity(transport: Transport, fallback: string): Promise<string> {
  return transport.ensureSession ? transport.ensureSession() : fallback
}

async function attach(
  transport: Transport,
  setup: MatchSetup,
  playerId: string,
  set: (partial: Partial<OnlineStore>) => void,
): Promise<void> {
  const client = new MatchClient(transport, setup, playerId, {
    onChange: (state) => {
      void useGameStore.getState().syncFromMatch(state)
    },
    onPlayers: (updated) => set({ setup: updated }),
    onStatus: (status) => set({ status }),
  })
  await client.connect()
  set({ client, setup: client.matchSetup, status: client.matchStatus, playerId })
  useGameStore.getState().setMatch(client)
}

/** Backend failures arrive as opaque codes like `auth/network-request-failed`,
 *  which tell a player nothing. These are the ones worth recognising, phrased
 *  so the person seeing them knows what to do. The raw code is kept on the end
 *  so an unexpected failure can still be reported precisely. */
const FRIENDLY_ERRORS: [RegExp, string][] = [
  [/auth\/network-request-failed|unavailable|failed to fetch/i,
    'Could not reach the server. Check your connection and try again.'],
  [/operation-not-allowed|admin-restricted-operation/i,
    'Anonymous sign-in is not enabled for this project yet.'],
  [/permission-denied|insufficient permissions/i,
    'The server refused that. The security rules may not be published yet.'],
  [/no match with that code/i, 'No game found with that code.'],
  [/already started/i, 'That game has already started.'],
  [/quota|resource-exhausted/i, 'The server is over its usage limit for today.'],
]

/** Record a match on this device so it can be resumed from the lobby. The
 *  list is keyed by match, so rejoining an existing one moves it to the top
 *  rather than adding a duplicate. */
function remember(
  setup: MatchSetup,
  playerId: string,
  set: (partial: Partial<OnlineStore>) => void,
): void {
  const entry: RecentMatch = {
    matchId: setup.matchId,
    code: setup.code,
    variant: setup.variant,
    lastPlayed: Date.now(),
    opponents: setup.players.filter((p) => p.id !== playerId).map((p) => p.name),
  }
  const others = loadRecent().filter((m) => m.matchId !== entry.matchId)
  const updated = [entry, ...others].slice(0, RECENT_LIMIT)
  saveRecent(updated)
  set({ recent: updated })
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  for (const [pattern, friendly] of FRIENDLY_ERRORS) {
    if (pattern.test(raw)) {
      const code = raw.match(/\(([^)]+)\)/)?.[1]
      return code ? `${friendly} (${code})` : friendly
    }
  }
  return raw
}
