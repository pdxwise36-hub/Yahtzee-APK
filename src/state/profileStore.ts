import { create } from 'zustand'
import { DEFAULT_BACKGROUND, DEFAULT_BOARD_THEME } from '@/ui/themes'
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

export type DiceSpeed = 'relaxed' | 'normal' | 'fast' | 'instant'

/** Playback multipliers for each speed. Instant resolves with no tumble. */
export const DICE_SPEED_RATES: Record<DiceSpeed, number> = {
  relaxed: 1,
  normal: 1.7,
  fast: 2.6,
  instant: 0,
}

export const DICE_SPEED_LABELS: Record<DiceSpeed, string> = {
  relaxed: 'Relaxed',
  normal: 'Normal',
  fast: 'Fast',
  instant: 'Instant',
}

interface StoredProfile {
  stats: Stats
  selectedSkin: string
  diceSpeed: DiceSpeed
  boardTheme: string
  background: string
}

/** Reading a profile must never take the game down: a corrupted or
 *  half-written entry falls back to a fresh profile rather than throwing on
 *  startup. Missing fields are filled from the defaults so a profile written
 *  by an older build still loads. */
function loadProfile(): StoredProfile {
  const fallback: StoredProfile = {
    stats: EMPTY_STATS,
    selectedSkin: 'ivory',
    diceSpeed: 'normal',
    boardTheme: DEFAULT_BOARD_THEME,
    background: DEFAULT_BACKGROUND,
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<StoredProfile>
    return {
      stats: { ...EMPTY_STATS, ...(parsed.stats ?? {}) },
      selectedSkin: parsed.selectedSkin ?? 'ivory',
      diceSpeed: parsed.diceSpeed && parsed.diceSpeed in DICE_SPEED_RATES
        ? parsed.diceSpeed
        : 'normal',
      boardTheme: parsed.boardTheme ?? DEFAULT_BOARD_THEME,
      background: parsed.background ?? DEFAULT_BACKGROUND,
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
  diceSpeed: DiceSpeed
  boardTheme: string
  background: string
  /** Achievements unlocked by the most recent game, for the reward popup. */
  pendingRewards: Achievement[]
  recordGame: (summary: GameSummary) => void
  selectSkin: (skinId: string) => void
  setDiceSpeed: (speed: DiceSpeed) => void
  setBoardTheme: (themeId: string) => void
  setBackground: (themeId: string) => void
  dismissRewards: () => void
  resetProfile: () => void
}

export const useProfileStore = create<ProfileStore>((set, get) => {
  const initial = loadProfile()

  return {
    stats: initial.stats,
    selectedSkin: initial.selectedSkin,
    diceSpeed: initial.diceSpeed,
    boardTheme: initial.boardTheme,
    background: initial.background,
    pendingRewards: [],

    recordGame: (summary) => {
      const before = get().stats
      const after = applyGame(before, summary)
      const rewards = newlyUnlocked(before, after)
      persist(get(), { stats: after })
      set({ stats: after, pendingRewards: rewards })
    },

    selectSkin: (skinId) => {
      // Guards against a skin selected in a previous build, or edited storage,
      // that this profile has not actually earned.
      if (!unlockedSkins(get().stats).includes(skinId)) return
      persist(get(), { selectedSkin: skinId })
      set({ selectedSkin: skinId })
    },

    setDiceSpeed: (speed) => {
      persist(get(), { diceSpeed: speed })
      set({ diceSpeed: speed })
    },

    setBoardTheme: (themeId) => {
      persist(get(), { boardTheme: themeId })
      set({ boardTheme: themeId })
    },

    setBackground: (themeId) => {
      persist(get(), { background: themeId })
      set({ background: themeId })
    },

    dismissRewards: () => set({ pendingRewards: [] }),

    resetProfile: () => {
      persist(get(), { stats: EMPTY_STATS, selectedSkin: 'ivory' })
      set({ stats: EMPTY_STATS, selectedSkin: 'ivory', pendingRewards: [] })
    },
  }
})

/** Write the whole profile, taking current values for anything not changing.
 *  Saving field by field is how a setting quietly gets dropped. */
function persist(current: ProfileStore, changes: Partial<StoredProfile>): void {
  saveProfile({
    stats: current.stats,
    selectedSkin: current.selectedSkin,
    diceSpeed: current.diceSpeed,
    boardTheme: current.boardTheme,
    background: current.background,
    ...changes,
  })
}

export function availableSkins(stats: Stats): string[] {
  return unlockedSkins(stats)
}
