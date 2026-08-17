import { create } from 'zustand'
import {
  EMPTY_STATS,
  applyGame,
  newlyUnlocked,
  unlockedSkins,
  type Achievement,
  type GameSummary,
  type Stats,
} from '@/progression/achievements'

const STORAGE_KEY = 'yahtzee.profile.v1'

interface StoredProfile {
  stats: Stats
  selectedSkin: string
}

/** Reading a profile must never take the game down: a corrupted or
 *  half-written entry falls back to a fresh profile rather than throwing on
 *  startup. Missing fields are filled from the defaults so a profile written
 *  by an older build still loads. */
function loadProfile(): StoredProfile {
  const fallback: StoredProfile = { stats: EMPTY_STATS, selectedSkin: 'ivory' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredProfile>
    return {
      stats: { ...EMPTY_STATS, ...(parsed.stats ?? {}) },
      selectedSkin: parsed.selectedSkin ?? 'ivory',
    }
  } catch {
    return fallback
  }
}

function saveProfile(profile: StoredProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // A full or disabled storage quota should cost the player their history,
    // not their game in progress.
  }
}

export interface ProfileStore {
  stats: Stats
  selectedSkin: string
  /** Achievements unlocked by the most recent game, for the reward popup. */
  pendingRewards: Achievement[]
  recordGame: (summary: GameSummary) => void
  selectSkin: (skinId: string) => void
  dismissRewards: () => void
  resetProfile: () => void
}

export const useProfileStore = create<ProfileStore>((set, get) => {
  const initial = loadProfile()

  return {
    stats: initial.stats,
    selectedSkin: initial.selectedSkin,
    pendingRewards: [],

    recordGame: (summary) => {
      const before = get().stats
      const after = applyGame(before, summary)
      const rewards = newlyUnlocked(before, after)
      saveProfile({ stats: after, selectedSkin: get().selectedSkin })
      set({ stats: after, pendingRewards: rewards })
    },

    selectSkin: (skinId) => {
      // Guards against a skin selected in a previous build, or edited storage,
      // that this profile has not actually earned.
      if (!unlockedSkins(get().stats).includes(skinId)) return
      saveProfile({ stats: get().stats, selectedSkin: skinId })
      set({ selectedSkin: skinId })
    },

    dismissRewards: () => set({ pendingRewards: [] }),

    resetProfile: () => {
      saveProfile({ stats: EMPTY_STATS, selectedSkin: 'ivory' })
      set({ stats: EMPTY_STATS, selectedSkin: 'ivory', pendingRewards: [] })
    },
  }
})

export function availableSkins(stats: Stats): string[] {
  return unlockedSkins(stats)
}
