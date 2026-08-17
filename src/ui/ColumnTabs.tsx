import { ALL_CATEGORIES } from '@/engine/types'
import { useGameStore, useTurnView } from '@/state/gameStore'

/** Column picker for the multi-column variants.
 *
 *  Triple Yahtzee is three scorecards played in one game, and which one a hand
 *  goes into is the whole decision — a big hand is worth three times as much
 *  in the last column. Without this the game was stuck on the first column,
 *  and unfinishable once that column filled. */
export function ColumnTabs(): JSX.Element | null {
  const view = useTurnView()
  const setActiveColumn = useGameStore((s) => s.setActiveColumn)
  const match = useGameStore((s) => s.match)
  if (!view || view.game.rules.columns < 2) return null

  const yours = match === null || match.myTurn
  const interactive = yours && !view.player.isAI

  return (
    <div className="columns" role="group" aria-label="Scorecard column">
      {view.player.cards.map((card, index) => {
        const filled = ALL_CATEGORIES.filter((c) => card[c] !== undefined).length
        const complete = filled === ALL_CATEGORIES.length
        const multiplier = view.game.rules.columnMultipliers[index] ?? 1

        return (
          <button
            key={index}
            type="button"
            className={[
              'column-tab',
              index === view.activeColumn ? 'is-active' : '',
              complete ? 'is-complete' : '',
            ].filter(Boolean).join(' ')}
            disabled={complete || !interactive}
            onClick={() => setActiveColumn(index)}
            aria-label={`Column ${index + 1}, ${multiplier} times score, ${filled} of ${ALL_CATEGORIES.length} filled`}
          >
            <span className="column-tab__mult">{multiplier}×</span>
            <span className="column-tab__fill">
              {complete ? 'done' : `${filled}/${ALL_CATEGORIES.length}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
