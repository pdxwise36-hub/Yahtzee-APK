/** Board surfaces the player can choose between.
 *
 *  Each theme carries its own accents rather than only a background colour.
 *  A palette swapped underneath fixed accents goes wrong in two specific
 *  ways: the bonus ring, tuned to sit on amber, reads as a stray orange on a
 *  cool board, and filled boxes sink into a pale or warm surface until the
 *  numbers already scored are hard to pick out. */
export interface BoardTheme {
  id: string
  name: string
  /** Representative colour for the picker swatch. */
  swatch: string
  vars: Record<string, string>
}

export const BOARD_THEMES: BoardTheme[] = [
  {
    id: 'amber',
    name: 'Amber',
    swatch: '#f2bd63',
    vars: {},
  },
  {
    id: 'felt',
    name: 'Felt',
    swatch: '#246645',
    vars: {
      '--board-top': '#2f7d55', '--board': '#246645', '--board-alt': '#1b4f36',
      '--board-rim': '#123726', '--board-sheen': 'rgba(255,255,255,0.16)',
      '--board-stripe': 'rgba(255,255,255,0.07)', '--board-inner': 'rgba(0,0,0,0.32)',
      '--label': '#cfe9d9', '--ink': '#1d5138', '--slot-rim': '#8fb9a1',
      '--slot-filled': '#cfe0cf', '--slot-filled-alt': '#bcd2bd', '--slot-filled-ink': '#31593f',
      '--board-accent': '#ffd85e', '--meter-fill': '#7fd39a', '--meter-track': 'rgba(0,0,0,0.32)', '--meter-core': '#1b4f36',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    swatch: '#3b4957',
    vars: {
      '--board-top': '#4a5a6b', '--board': '#3b4957', '--board-alt': '#2c3742',
      '--board-rim': '#1b232b', '--board-sheen': 'rgba(255,255,255,0.15)',
      '--board-stripe': 'rgba(255,255,255,0.06)', '--board-inner': 'rgba(0,0,0,0.35)',
      '--label': '#d3dde7', '--ink': '#2b3945', '--slot-rim': '#93a2b1',
      '--slot-filled': '#cdd7e0', '--slot-filled-alt': '#b9c5d0', '--slot-filled-ink': '#3c4c5a',
      '--board-accent': '#ffd85e', '--meter-fill': '#8fc4ff', '--meter-track': 'rgba(0,0,0,0.35)', '--meter-core': '#2c3742',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    swatch: '#14666b',
    vars: {
      '--board-top': '#1d7f83', '--board': '#14666b', '--board-alt': '#0d4c52',
      '--board-rim': '#08343a', '--board-sheen': 'rgba(255,255,255,0.17)',
      '--board-stripe': 'rgba(255,255,255,0.07)', '--board-inner': 'rgba(0,0,0,0.32)',
      '--label': '#c8ecec', '--ink': '#0f4f54', '--slot-rim': '#8bbcbe',
      '--slot-filled': '#c6dedf', '--slot-filled-alt': '#b0cdcf', '--slot-filled-ink': '#215c60',
      '--board-accent': '#ffe07a', '--meter-fill': '#6fe0e6', '--meter-track': 'rgba(0,0,0,0.32)', '--meter-core': '#0d4c52',
    },
  },
  {
    id: 'walnut',
    name: 'Walnut',
    swatch: '#835533',
    vars: {
      '--board-top': '#9a6a42', '--board': '#835533', '--board-alt': '#6a4226',
      '--board-rim': '#452a17', '--board-sheen': 'rgba(255,255,255,0.18)',
      '--board-stripe': 'rgba(255,255,255,0.07)', '--board-inner': 'rgba(0,0,0,0.34)',
      '--label': '#efd9c2', '--ink': '#5c3a1f', '--slot-rim': '#b08a63',
      // Darker than the default, or a scored box disappears into the wood.
      '--slot-filled': '#d8c3a6', '--slot-filled-alt': '#c4ad8d', '--slot-filled-ink': '#5c3a1f',
      '--board-accent': '#ffd07a', '--meter-fill': '#e8b271', '--meter-track': 'rgba(0,0,0,0.34)', '--meter-core': '#6a4226',
    },
  },
  {
    id: 'paper',
    name: 'Paper',
    swatch: '#f3ecdb',
    vars: {
      '--board-top': '#fbf6ea', '--board': '#f3ecdb', '--board-alt': '#e8dfc9',
      '--board-rim': '#b9ae94', '--board-sheen': 'rgba(255,255,255,0.5)',
      '--board-stripe': 'rgba(120,100,60,0.06)', '--board-inner': 'rgba(120,100,60,0.2)',
      '--label': '#7d6a45', '--ink': '#5d4f34', '--slot': '#ffffff', '--slot-rim': '#c9bd9e',
      // A pale board needs its filled boxes darkened most of all.
      '--slot-filled': '#ddd3ba', '--slot-filled-alt': '#cbc0a4', '--slot-filled-ink': '#5d4f34',
      '--board-accent': '#c9781a', '--meter-fill': '#d8a33f', '--meter-track': 'rgba(120,100,60,0.28)', '--meter-core': '#9a8a63',
    },
  },
]

export const DEFAULT_BOARD_THEME = 'amber'

export function boardTheme(id: string): BoardTheme {
  return BOARD_THEMES.find((t) => t.id === id) ?? (BOARD_THEMES[0] as BoardTheme)
}

/** Paint a theme onto the document. Themes only override what they change, so
 *  anything they leave out falls back to the stylesheet's own value. */
export function applyBoardTheme(id: string): void {
  const root = document.documentElement
  const known = new Set(BOARD_THEMES.flatMap((t) => Object.keys(t.vars)))
  for (const name of known) root.style.removeProperty(name)
  for (const [name, value] of Object.entries(boardTheme(id).vars)) {
    root.style.setProperty(name, value)
  }
}


/** Backgrounds the board sits on.
 *
 *  Kept separate from the board itself so the two can be paired freely. All
 *  of them are mid-to-dark, because the faint dice scatter over the top is
 *  drawn in white and would disappear on a pale surface. */
export interface BackgroundTheme {
  id: string
  name: string
  swatch: string
  vars: Record<string, string>
}

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  { id: 'ocean', name: 'Ocean', swatch: '#1a86dd', vars: {} },
  {
    id: 'midnight', name: 'Midnight', swatch: '#16233f',
    vars: { '--sky': '#22355c', '--sky-deep': '#070d1c' },
  },
  {
    id: 'forest', name: 'Forest', swatch: '#1f6b46',
    vars: { '--sky': '#2a8659', '--sky-deep': '#07301c' },
  },
  {
    id: 'plum', name: 'Plum', swatch: '#4a2a6b',
    vars: { '--sky': '#5f3688', '--sky-deep': '#1b0f2d' },
  },
  {
    id: 'ember', name: 'Ember', swatch: '#a8482a',
    vars: { '--sky': '#c25a31', '--sky-deep': '#3f1408' },
  },
  {
    id: 'charcoal', name: 'Charcoal', swatch: '#333941',
    vars: { '--sky': '#454d57', '--sky-deep': '#14171b' },
  },
]

export const DEFAULT_BACKGROUND = 'ocean'

export function backgroundTheme(id: string): BackgroundTheme {
  return BACKGROUND_THEMES.find((t) => t.id === id) ?? (BACKGROUND_THEMES[0] as BackgroundTheme)
}

export function applyBackgroundTheme(id: string): void {
  const root = document.documentElement
  const known = new Set(BACKGROUND_THEMES.flatMap((t) => Object.keys(t.vars)))
  for (const name of known) root.style.removeProperty(name)
  for (const [name, value] of Object.entries(backgroundTheme(id).vars)) {
    root.style.setProperty(name, value)
  }
  // Keep the Android status bar in step with whatever is behind the game.
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute(
      'content',
      getComputedStyle(root).getPropertyValue('--sky-deep').trim() || '#0b5798',
    )
  }
}
