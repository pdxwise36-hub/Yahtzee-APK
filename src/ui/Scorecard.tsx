import {
  CATEGORY_LABELS,
  LOWER_CATEGORIES,
  UPPER_CATEGORIES,
  type CategoryId,
} from '@/engine/types'
import { columnTotals, upperSubtotal, pointsToBonus } from '@/engine/scoring'
import { useGameStore, useTurnView } from '@/state/gameStore'

interface RowProps {
  category: CategoryId
  filled: number | undefined
  preview: number | undefined
  legal: boolean
  onPick: (category: CategoryId) => void
}

function ScoreRow({ category, filled, preview, legal, onPick }: RowProps): JSX.Element {
  const isFilled = filled !== undefined
  const showPreview = !isFilled && legal && preview !== undefined
  // A legal box worth nothing is still a legal box — players sacrifice one on a
  // bad turn — but it should look like the sacrifice it is.
  const isZero = showPreview && preview === 0

  return (
    <button
      type="button"
      className={[
        'score-row',
        isFilled ? 'is-filled' : '',
        showPreview ? 'is-available' : '',
        isZero ? 'is-zero' : '',
      ].filter(Boolean).join(' ')}
      disabled={isFilled || !legal}
      onClick={() => onPick(category)}
    >
      <span className="score-row__label">{CATEGORY_LABELS[category]}</span>
      <span className="score-row__value">
        {isFilled ? filled : showPreview ? preview : ''}
      </span>
    </button>
  )
}

export function Scorecard(): JSX.Element | null {
  const view = useTurnView()
  const score = useGameStore((s) => s.score)
  if (!view) return null

  const { card, preview, legal, game } = view
  const totals = columnTotals(
    card,
    game.rules,
    view.player.yahtzeeBonuses[view.activeColumn] ?? 0,
    game.rules.columnMultipliers[view.activeColumn] ?? 1,
  )
  const remaining = pointsToBonus(card, game.rules)

  return (
    <section className="scorecard" aria-label="Scorecard">
      <div className="scorecard__grid">
        <div className="scorecard__section">
          <h3 className="scorecard__heading">Upper</h3>
          {UPPER_CATEGORIES.map((category) => (
            <ScoreRow
              key={category}
              category={category}
              filled={card[category]}
              preview={preview[category]}
              legal={legal.has(category)}
              onPick={score}
            />
          ))}
          <div className={`scorecard__meta ${remaining <= 0 ? 'is-earned' : ''}`}>
            <span>Bonus</span>
            <span>
              {remaining <= 0
                ? `+${game.rules.upperBonusValue}`
                : `${upperSubtotal(card)}/${game.rules.upperBonusThreshold}`}
            </span>
          </div>
        </div>

        <div className="scorecard__section">
          <h3 className="scorecard__heading">Lower</h3>
          {LOWER_CATEGORIES.map((category) => (
            <ScoreRow
              key={category}
              category={category}
              filled={card[category]}
              preview={preview[category]}
              legal={legal.has(category)}
              onPick={score}
            />
          ))}
          {totals.yahtzeeBonus > 0 && (
            <div className="scorecard__meta is-earned">
              <span>Yahtzee bonus</span>
              <span>+{totals.yahtzeeBonus}</span>
            </div>
          )}
        </div>
      </div>

      <div className="scorecard__total">
        <span>Total</span>
        <strong>{totals.total}</strong>
      </div>
    </section>
  )
}
