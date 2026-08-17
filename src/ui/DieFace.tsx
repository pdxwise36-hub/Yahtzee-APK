import type { DieValue } from '@/engine/types'

/** Pip layout per face, on a 3x3 grid (1-indexed cells reading left to right,
 *  top to bottom). Drawn rather than imported so the board icons stay crisp at
 *  any size and can be recoloured by CSS. */
const PIPS: Record<DieValue, number[]> = {
  1: [5],
  2: [1, 9],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
}

export function DieFace({ value }: { value: DieValue }): JSX.Element {
  const cells = PIPS[value]
  return (
    <span className="die-face" aria-hidden="true">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cells.includes(i + 1) ? 'die-face__pip' : ''} />
      ))}
    </span>
  )
}
