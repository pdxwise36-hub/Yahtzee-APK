import { DICE_SKINS } from '@/dice3d/diceGeometry'
import { useProfileStore } from '@/state/profileStore'

/** Shown after a game that unlocked something. Stacks multiple unlocks into
 *  one panel rather than queueing several popups at the player. */
export function Rewards(): JSX.Element | null {
  const rewards = useProfileStore((s) => s.pendingRewards)
  const dismiss = useProfileStore((s) => s.dismissRewards)
  if (rewards.length === 0) return null

  return (
    <div className="rewards" role="dialog" aria-label="Achievements unlocked">
      <div className="rewards__panel">
        <h2 className="rewards__title">
          {rewards.length > 1 ? `${rewards.length} unlocks!` : 'Unlocked!'}
        </h2>
        <ul className="rewards__list">
          {rewards.map((achievement) => {
            const skin =
              achievement.reward.kind === 'diceSkin'
                ? DICE_SKINS[achievement.reward.id]
                : undefined
            return (
              <li key={achievement.id}>
                <span
                  className="rewards__chip"
                  style={skin ? { background: skin.body, color: skin.pip } : undefined}
                >
                  {skin ? '⬤' : '★'}
                </span>
                <span className="rewards__text">
                  <strong>{achievement.name}</strong>
                  <span>
                    {skin ? `${skin.name} dice unlocked` : achievement.description}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
        <button type="button" className="button button--primary" onClick={dismiss}>
          Nice
        </button>
      </div>
    </div>
  )
}
