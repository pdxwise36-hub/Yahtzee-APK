import type { LowerCategory } from '@/engine/types'

/** Icons for the lower section.
 *
 *  These were words before — SMALL, LARGE, YAHTZEE — set at around six pixels
 *  to fit the tile, which is unreadable on a phone. Shapes carry the meaning
 *  instead: a run of ascending bars for the straights, where the number of
 *  bars is the length of run required, and a star for the top prize. */
export function CategoryIcon({ category }: { category: LowerCategory }): JSX.Element {
  switch (category) {
    case 'threeOfAKind':
      return <span className="tile__text">3x</span>
    case 'fourOfAKind':
      return <span className="tile__text">4x</span>

    case 'fullHouse':
      return (
        <svg className="tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.6 1.8 11h3.1v10.4h14.2V11h3.1Z" fill="currentColor" />
          <rect x="9.6" y="14" width="4.8" height="7.4" rx="0.6" fill="rgba(0,0,0,0.28)" />
        </svg>
      )

    // Rising bars carry the idea of a run; the numeral carries its length,
    // because four bars against five is not a difference the eye can pick out
    // at the size these are drawn.
    case 'smallStraight':
      return <Stairs steps={4} />

    case 'largeStraight':
      return <Stairs steps={5} />

    case 'yahtzee':
      return (
        <svg className="tile__glyph tile__glyph--star" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 1.8l3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.6l-6.2 3.3L7 14 2 9.1l6.9-1Z"
            fill="currentColor"
          />
        </svg>
      )

    case 'chance':
      return <span className="tile__text">?</span>
  }
}

/** A rising run of bars, sized so any number of steps fills the same box. */
function Stairs({ steps }: { steps: number }): JSX.Element {
  const gap = 1.3
  const width = (24 - gap * (steps - 1)) / steps
  return (
    <span className="tile__stack">
      <svg className="tile__glyph tile__glyph--stairs" viewBox="0 0 24 24" aria-hidden="true">
        {Array.from({ length: steps }, (_, i) => {
          const height = 7 + (i / (steps - 1)) * 15
          return (
            <rect
              key={i}
              x={i * (width + gap)}
              y={24 - height}
              width={width}
              height={height}
              rx={Math.min(1.4, width / 2.6)}
              fill="currentColor"
            />
          )
        })}
      </svg>
      <span className="tile__count">{steps}</span>
    </span>
  )
}
