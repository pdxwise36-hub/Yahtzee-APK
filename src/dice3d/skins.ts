/** The dice catalogue: what each set is made of and what is painted on it.
 *
 *  Pure data, deliberately free of Three.js and of the canvas, so progression
 *  and the settings screen can ask what dice exist without pulling in the
 *  renderer. `diceGeometry` turns these into textures and materials. */

/** What a pip is drawn as. Skins were colour-only until novelty dice needed
 *  their spots to be something other than spots. */
export type PipShape = 'dot' | 'cheeky'

/** Six little illustrations, one per face, indexed by value - 1. */
export type DecorSet = readonly [string, string, string, string, string, string]

/** Six drawn face textures, one per face, indexed by value - 1. Paths are
 *  served from `public/`, so they are in the bundle an update ships. */
export type FaceArtSet = readonly [string, string, string, string, string, string]

export interface DiceSkin {
  id: string
  name: string
  body: string
  pip: string
  /** Subtle rim tint painted into the texture edges. */
  edge: string
  roughness: number
  metalness: number
  pipShape?: PipShape
  /** Paints wood grain into the face, for the dice that are meant to be wood. */
  grain?: boolean
  /** Art painted into the part of the face the pips leave empty. The pips go
   *  on top and keep their standard layout, so the number still reads at a
   *  glance — the joke never costs you the ability to play. */
  decor?: DecorSet
  /** Drawn illustrations covering each face, in place of `decor`. Same rule:
   *  the pips are laid over the top and the number always reads. */
  faceArt?: FaceArtSet
}

export const DICE_SKINS: Record<string, DiceSkin> = {
  ivory: {
    id: 'ivory', name: 'Ivory', body: '#f8f4e8', pip: '#121214',
    edge: '#d9d0ba', roughness: 0.32, metalness: 0.02,
  },
  midnight: {
    id: 'midnight', name: 'Midnight', body: '#1b1f2a', pip: '#e8ecf5',
    edge: '#0d1017', roughness: 0.28, metalness: 0.15,
  },
  ruby: {
    id: 'ruby', name: 'Ruby', body: '#9b1c2e', pip: '#ffe9ec',
    edge: '#6d1220', roughness: 0.22, metalness: 0.08,
  },
  gold: {
    id: 'gold', name: 'Gold', body: '#d4a92c', pip: '#3a2a05',
    edge: '#a37f18', roughness: 0.18, metalness: 0.75,
  },
  jade: {
    id: 'jade', name: 'Jade', body: '#1f7a5e', pip: '#eafff6',
    edge: '#12513e', roughness: 0.25, metalness: 0.1,
  },
  neon: {
    id: 'neon', name: 'Neon', body: '#12121a', pip: '#39ff9e',
    edge: '#05050a', roughness: 0.4, metalness: 0.05,
  },
  sapphire: {
    id: 'sapphire', name: 'Sapphire', body: '#1d4fa8', pip: '#e2edff',
    edge: '#123068', roughness: 0.2, metalness: 0.12,
  },
  coral: {
    id: 'coral', name: 'Coral', body: '#ff6f4d', pip: '#fff2ee',
    edge: '#b8421f', roughness: 0.3, metalness: 0.04,
  },
  amethyst: {
    id: 'amethyst', name: 'Amethyst', body: '#6d40a6', pip: '#f4e8ff',
    edge: '#42226a', roughness: 0.22, metalness: 0.14,
  },
  silver: {
    id: 'silver', name: 'Silver', body: '#c9ced6', pip: '#23272e',
    edge: '#8b9099', roughness: 0.14, metalness: 0.88,
  },
  bubblegum: {
    id: 'bubblegum', name: 'Bubblegum', body: '#ff8fc4', pip: '#4d0f31',
    edge: '#c75f92', roughness: 0.28, metalness: 0.03,
  },
  oak: {
    id: 'oak', name: 'Oak', body: '#a9713c', pip: '#f7e8d2',
    edge: '#6d4520', roughness: 0.55, metalness: 0.02,
  },
  cheeky: {
    id: 'cheeky', name: 'Cheeky', body: '#e8cfa0', pip: '#2b1c0c',
    edge: '#b8975f', roughness: 0.62, metalness: 0.01,
    pipShape: 'cheeky', grain: true,
  },

  // Themed sets. Each face keeps the standard pip layout and gains a small
  // scene in the space the pips do not use, with the sixth face carrying the
  // set's mascot at full size.
  catChaos: {
    id: 'catChaos', name: 'Cat Chaos', body: '#f7f2e6', pip: '#1a1a1e',
    edge: '#d6ccb6', roughness: 0.34, metalness: 0.02,
    decor: ['🐈', '🧶', '🐾', '🙀', '🥛', '😾'],
  },
  trashPanda: {
    id: 'trashPanda', name: 'Trash Panda', body: '#e4e6e6', pip: '#22252a',
    edge: '#b1b6b8', roughness: 0.36, metalness: 0.02,
    decor: ['🥫', '🍌', '🍕', '🗑️', '🌙', '🦝'],
  },
  bathroom: {
    id: 'bathroom', name: 'Bathroom Humor', body: '#dce8ef', pip: '#1d2a33',
    edge: '#a7bdc9', roughness: 0.3, metalness: 0.03,
    decor: ['💨', '🧻', '🪠', '🚽', '🧼', '💩'],
  },
  squirrel: {
    // Drawn art rather than emoji. The body colour is taken from the
    // illustrations' own background so the edges of the cube match the faces.
    id: 'squirrel', name: 'Drunk Squirrel', body: '#fdd685', pip: '#3a2a10',
    edge: '#d3a850', roughness: 0.42, metalness: 0.02,
    faceArt: [
      '/dice/squirrel/1.webp',
      '/dice/squirrel/2.webp',
      '/dice/squirrel/3.webp',
      '/dice/squirrel/4.webp',
      '/dice/squirrel/5.webp',
      '/dice/squirrel/6.webp',
    ],
  },
  chicken: {
    id: 'chicken', name: 'Angry Chicken', body: '#f8eec2', pip: '#4a3708',
    edge: '#d2be7d', roughness: 0.38, metalness: 0.02,
    decor: ['🥚', '🪶', '🐣', '🍗', '😤', '🐔'],
  },
  office: {
    id: 'office', name: 'Office Hell', body: '#f1f1f4', pip: '#23262d',
    edge: '#bdbfc6', roughness: 0.26, metalness: 0.03,
    decor: ['📝', '📚', '☕', '🖨️', '📋', '😫'],
  },
  pirate: {
    id: 'pirate', name: 'Pirate Loot', body: '#e9dcb9', pip: '#2f2413',
    edge: '#b7a477', roughness: 0.48, metalness: 0.03,
    decor: ['🪙', '🪝', '🍾', '🦜', '💀', '🏴‍☠️'],
  },
  monster: {
    id: 'monster', name: 'Monster Mayhem', body: '#cdb9ec', pip: '#2c1a45',
    edge: '#9b82c2', roughness: 0.3, metalness: 0.04,
    decor: ['👾', '👻', '👹', '👺', '🎃', '😈'],
  },
  alien: {
    id: 'alien', name: 'Alien Invasion', body: '#d8ead1', pip: '#1d3a1c',
    edge: '#a6c49d', roughness: 0.28, metalness: 0.06,
    decor: ['🛸', '🛰️', '⚡', '🐄', '🚀', '👽'],
  },
  fastFood: {
    id: 'fastFood', name: 'Fast Food Frenzy', body: '#f9f1e0', pip: '#3a2410',
    edge: '#d4c1a0', roughness: 0.3, metalness: 0.02,
    decor: ['🍟', '🌭', '🍕', '🥤', '🍩', '🍔'],
  },
}
