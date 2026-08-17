import {
  CATEGORY_LABELS,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  UPPER_FACE,
  type CategoryId,
} from '@/engine/types'
import { upperSubtotal } from '@/engine/scoring'
import type { PlayerState } from '@/engine/game'
import { useGameStore, useTurnView } from '@/state/gameStore'
import { DieFace } from './DieFace'
import { CategoryIcon } from './CategoryIcon'

interface CellProps {
  category: CategoryId
  players: readonly PlayerState[]
  /** Which player may actually be scored into right now. */
  activePlayer: number
  column: number
  preview: number | undefined
  legal: boolean
  interactive: boolean
  onPick: (category: CategoryId) => void
  children: JSX.Element
}

/** A tile plus one score box per player, so an opponent's card sits alongside
 *  yours on the same row rather than on a screen you have to switch to. */
function Cell({
  category,
  players,
  activePlayer,
  column,
  preview,
  legal,
  interactive,
  onPick,
  children,
}: CellProps): JSX.Element {
  return (
    <>
      <span className="tile" aria-hidden="true">
        {children}
      </span>
      {players.map((player, index) => {
        const filled = player.cards[column]?.[category]
        const isFilled = filled !== undefined
        const isActive = index === activePlayer
        const available = isActive && interactive && !isFilled && legal && preview !== undefined
        const isZero = available && preview === 0

        return (
          <button
            key={player.id}
            type="button"
            className={[
              'slot',
              isFilled ? 'is-filled' : '',
              available ? 'is-available' : '',
              isZero ? 'is-zero' : '',
              isActive ? '' : 'is-opponent',
            ].filter(Boolean).join(' ')}
            disabled={!available}
            onClick={() => onPick(category)}
            aria-label={`${CATEGORY_LABELS[category]}, ${player.name}${
              isFilled ? `, scored ${filled}` : available ? `, scores ${preview}` : ''
            }`}
          >
            {isFilled ? filled : available ? preview : ''}
          </button>
        )
      })}
    </>
  )
}

export function Scorecard(): JSX.Element | null {
  const view = useTurnView()
  const score = useGameStore((s) => s.score)
  const match = useGameStore((s) => s.match)
  if (!view) return null

  const { card, preview, legal, game, activeColumn } = view
  const subtotal = upperSubtotal(card)
  const threshold = game.rules.upperBonusThreshold
  const earned = subtotal >= threshold
  const players = game.players
  // A box may only be tapped by a human, on their own turn, on their own
  // device: an AI plays itself, and online the other seats are not yours.
  const interactive =
    !players[game.currentPlayer]?.isAI && (match === null || match.myTurn)

  // Both halves of the card are laid out as one grid of equal rows, so the
  // upper and lower sections line up exactly and the striping can run
  // unbroken across the full width of the board.
  const rows = LOWER_CATEGORIES.map((lower, i) => ({ upper: UPPER_CATEGORIES[i], lower }))

  const shared = {
    players,
    activePlayer: game.currentPlayer,
    column: activeColumn,
    interactive,
    onPick: score,
  }

  return (
    <section
      className="board"
      aria-label="Scorecard"
      style={{ ['--players' as string]: players.length }}
    >
      <div className="board__grid">
        {rows.map(({ upper, lower }) => (
          <div className="board__row" key={lower}>
            {upper ? (
              <div className="board__half">
                <Cell
                  {...shared}
                  category={upper}
                  preview={preview[upper]}
                  legal={legal.has(upper)}
                >
                  <DieFace value={UPPER_FACE[upper]} />
                </Cell>
              </div>
            ) : (
              <div className="board__half board__bonus">
                <span className="board__bonus-label">
                  Section
                  <br />
                  bonus
                  <strong>+{game.rules.upperBonusValue}</strong>
                </span>
                <span
                  className={`meter ${earned ? 'is-earned' : ''}`}
                  style={{
                    // The ring fills clockwise with progress toward the bonus.
                    ['--fill' as string]: `${Math.min(100, (subtotal / threshold) * 100)}%`,
                  }}
                >
                  <span className="meter__value">
                    {earned ? `+${game.rules.upperBonusValue}` : `${subtotal}/${threshold}`}
                  </span>
                </span>
              </div>
            )}
            <div className="board__half">
              <Cell
                {...shared}
                category={lower}
                preview={preview[lower]}
                legal={legal.has(lower)}
              >
                <CategoryIcon category={lower} />
              </Cell>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
