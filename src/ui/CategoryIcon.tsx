import type { LowerCategory } from '@/engine/types'

/** Icons for the lower section, following the printed board: a count for the
 *  of-a-kind boxes, a house, a fan of cards for the straights with the run
 *  length named beneath, and the Yahtzee wordmark for the top prize. */
export function CategoryIcon({ category }: { category: LowerCategory }): JSX.Element {
  switch (category) {
    case 'threeOfAKind':
      return <span className="tile__text">3x</span>
    case 'fourOfAKind':
      return <span className="tile__text">4x</span>

    case 'fullHouse':
      return (
        <svg className="tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2.4 1.6 11h3.2v10.6h14.4V11h3.2Z" fill="currentColor" />
          <rect x="9.6" y="14.2" width="4.8" height="7.4" rx="0.6" fill="rgba(0,0,0,0.26)" />
        </svg>
      )

    case 'smallStraight':
      return <CardFan label="SMALL" />
    case 'largeStraight':
      return <CardFan label="LARGE" />

    case 'yahtzee':
      return <span className="tile__word">Yahtzee</span>

    case 'chance':
      return <span className="tile__text">?</span>
  }
}

/** A splayed hand of cards. The straights are the two boxes about sequence
 *  rather than about a number, and a fan reads that way instantly where four
 *  bars against five did not. */
function CardFan({ label }: { label: string }): JSX.Element {
  // Splayed about a pivot below the icon, so the cards open upward like a
  // hand being held. The viewBox is wider than tall to leave room for the
  // outermost cards once they are rotated.
  const cards = [-30, -10, 10, 30]
  return (
    <span className="tile__stack">
      <svg className="tile__fan" viewBox="0 0 40 30" aria-hidden="true">
        <g transform="translate(20 30)">
          {cards.map((angle, i) => (
            <rect
              key={i}
              x={-5.5}
              y={-25}
              width={11}
              height={17}
              rx={2}
              fill="currentColor"
              stroke="rgba(0,0,0,0.28)"
              strokeWidth="0.9"
              transform={`rotate(${angle})`}
            />
          ))}
        </g>
      </svg>
      <span className="tile__label">{label}</span>
    </span>
  )
}
