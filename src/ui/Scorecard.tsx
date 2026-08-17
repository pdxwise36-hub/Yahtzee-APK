import {
  CATEGORY_LABELS,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  UPPER_FACE,
  type CategoryId,
  type LowerCategory,
} from '@/engine/types'
import { upperSubtotal } from '@/engine/scoring'
import { useGameStore, useTurnView } from '@/state/gameStore'
import { DieFace } from './DieFace'

/** Compact glyphs for the lower section, matching how the physical card reads:
 *  a count for the of-a-kind boxes, a house, then the straights by length. */
function LowerIcon({ category }: { category: LowerCategory }): JSX.Element {
  switch (category) {
    case 'threeOfAKind':
      return <span className="tile__text">3x</span>
    case 'fourOfAKind':
      return <span className="tile__text">4x</span>
    case 'fullHouse':
      return (
        <svg className="tile__glyph" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2.5 11h3v10h13V11h3Z" fill="currentColor" />
        </svg>
      )
    case 'smallStraight':
      return <span className="tile__text tile__text--small">SMALL</span>
    case 'largeStraight':
      return <span className="tile__text tile__text--small">LARGE</span>
    case 'yahtzee':
      return <span className="tile__text tile__text--yahtzee">YAHTZEE</span>
    case 'chance':
      return <span className="tile__text">?</span>
  }
}

interface RowProps {
  category: CategoryId
  filled: number | undefined
  preview: number | undefined
  legal: boolean
  onPick: (category: CategoryId) => void
  children: JSX.Element
}

function BoardRow({ category, filled, preview, legal, onPick, children }: RowProps): JSX.Element {
  const isFilled = filled !== undefined
  const available = !isFilled && legal && preview !== undefined
  const isZero = available && preview === 0

  return (
    <div className="board__row">
      <span className="tile" aria-hidden="true">
        {children}
      </span>
      <button
        type="button"
        className={[
          'slot',
          isFilled ? 'is-filled' : '',
          available ? 'is-available' : '',
          isZero ? 'is-zero' : '',
        ].filter(Boolean).join(' ')}
        disabled={!available}
        onClick={() => onPick(category)}
        aria-label={`${CATEGORY_LABELS[category]}${isFilled ? `, scored ${filled}` : available ? `, scores ${preview}` : ', unavailable'}`}
      >
        {isFilled ? filled : available ? preview : ''}
      </button>
    </div>
  )
}

export function Scorecard(): JSX.Element | null {
  const view = useTurnView()
  const score = useGameStore((s) => s.score)
  if (!view) return null

  const { card, preview, legal, game } = view
  const subtotal = upperSubtotal(card)
  const earned = subtotal >= game.rules.upperBonusThreshold

  return (
    <section className="board" aria-label="Scorecard">
      <div className="board__columns">
        <div className="board__column">
          {UPPER_CATEGORIES.map((category) => (
            <BoardRow
              key={category}
              category={category}
              filled={card[category]}
              preview={preview[category]}
              legal={legal.has(category)}
              onPick={score}
            >
              <DieFace value={UPPER_FACE[category]} />
            </BoardRow>
          ))}
          <div className="board__bonus">
            <span className="board__bonus-label">
              Section bonus
              <strong>+{game.rules.upperBonusValue}</strong>
            </span>
            <span className={`board__bonus-meter ${earned ? 'is-earned' : ''}`}>
              {earned ? `+${game.rules.upperBonusValue}` : `${subtotal}/${game.rules.upperBonusThreshold}`}
            </span>
          </div>
        </div>

        <div className="board__column">
          {LOWER_CATEGORIES.map((category) => (
            <BoardRow
              key={category}
              category={category}
              filled={card[category]}
              preview={preview[category]}
              legal={legal.has(category)}
              onPick={score}
            >
              <LowerIcon category={category} />
            </BoardRow>
          ))}
        </div>
      </div>
    </section>
  )
}
