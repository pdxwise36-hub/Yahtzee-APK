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

/** Boxes that wear a star: the two straights and Yahtzee. */
const STARRED: ReadonlySet<CategoryId> = new Set<CategoryId>([
  'smallStraight',
  'largeStraight',
  'yahtzee',
])

interface CellProps {
  category: CategoryId
  /** Optional flash of gold on the tile, e.g. banked Yahtzee bonuses. */
  badge?: string | undefined
  players: readonly PlayerState[]
  /** Which player may actually be scored into right now. */
  activePlayer: number
  /** The seat belonging to this device. Only that column is drawn as boxes;
   *  an opponent's scores are written straight onto the board, as they are on
   *  the printed card. */
  ownSeat: number
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
  badge,
  players,
  activePlayer,
  ownSeat,
  column,
  preview,
  legal,
  interactive,
  onPick,
  children,
}: CellProps): JSX.Element {
  return (
    <>
      <span
        className={`tile ${STARRED.has(category) ? 'tile--starred' : ''}`}
        aria-hidden="true"
      >
        {children}
        {badge && <span className="tile__star">{badge}</span>}
      </span>
      {players.map((player, index) => {
        const filled = player.cards[column]?.[category]
        const isFilled = filled !== undefined

        if (index !== ownSeat) {
          return (
            <span
              key={player.id}
              className="tally"
              aria-label={`${CATEGORY_LABELS[category]}, ${player.name}${
                isFilled ? `, scored ${filled}` : ', not scored'
              }`}
            >
              {isFilled ? filled : ''}
            </span>
          )
        }

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

  const { preview, legal, game, activeColumn } = view
  // Extra Yahtzees are worth a hundred each and used to be banked silently:
  // the total moved and nothing on the board said why.
  const bonusCount = view.player.yahtzeeBonuses[activeColumn] ?? 0
  const threshold = game.rules.upperBonusThreshold
  const players = game.players
  // A box may only be tapped by a human, on their own turn, on their own
  // device: an AI plays itself, and online the other seats are not yours.
  const interactive =
    !players[game.currentPlayer]?.isAI && (match === null || match.myTurn)

  // Both halves of the card are laid out as one grid of equal rows, so the
  // upper and lower sections line up exactly and the striping can run
  // unbroken across the full width of the board.
  const rows = LOWER_CATEGORIES.map((lower, i) => ({ upper: UPPER_CATEGORIES[i], lower }))

  // Online this device owns its own seat; offline the human is always first.
  const ownSeat = match ? Math.max(0, match.seat) : players.findIndex((p) => !p.isAI)

  const shared = {
    players,
    activePlayer: game.currentPlayer,
    ownSeat: ownSeat < 0 ? 0 : ownSeat,
    column: activeColumn,
    interactive,
    onPick: score,
  }

  return (
    <section
      className="board"
      aria-label="Scorecard"
      style={{
        ['--players' as string]: players.length,
        // The rule between columns only means anything with someone to divide.
        ['--divider' as string]: players.length > 1 ? 1 : 0,
      }}
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
                {/* One meter per player, so both cards' progress towards the
                    bonus is on the board rather than only the current one. */}
                {players.map((player, seat) => {
                  const theirCard = player.cards[activeColumn] ?? {}
                  const theirSubtotal = upperSubtotal(theirCard)
                  const theirEarned = theirSubtotal >= threshold
                  return (
                    <span
                      key={player.id}
                      className={`meter ${theirEarned ? 'is-earned' : ''}`}
                      style={{
                        ['--fill' as string]: `${Math.min(100, (theirSubtotal / threshold) * 100)}%`,
                      }}
                      aria-label={`${player.name} upper section ${theirSubtotal} of ${threshold}`}
                    >
                      <span className="meter__value">
                        {theirEarned ? `+${game.rules.upperBonusValue}` : `${theirSubtotal}/${threshold}`}
                      </span>
                      {seat === 0 && <span className="meter__info">i</span>}
                    </span>
                  )
                })}
              </div>
            )}
            <div className="board__half">
              <Cell
                {...shared}
                category={lower}
                preview={preview[lower]}
                legal={legal.has(lower)}
                badge={
                  lower === 'yahtzee' && bonusCount > 0 ? String(bonusCount) : undefined
                }
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
