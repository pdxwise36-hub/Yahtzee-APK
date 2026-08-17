import { DICE_SKINS } from '@/dice3d/diceGeometry'
import { unlockedSkins, ACHIEVEMENTS, isUnlocked, averageScore } from '@/progression/achievements'
import {
  DICE_SPEED_LABELS,
  DICE_SPEED_RATES,
  useProfileStore,
  type DiceSpeed,
} from '@/state/profileStore'
import { BACKGROUND_THEMES, BOARD_THEMES } from './themes'

/** Everything the player can change about how the game looks and feels,
 *  gathered in one place. These used to sit on the menu alongside the things
 *  you choose per game, which made both harder to find. */
export function Settings({ onBack }: { onBack: () => void }): JSX.Element {
  const stats = useProfileStore((s) => s.stats)
  const skin = useProfileStore((s) => s.selectedSkin)
  const speed = useProfileStore((s) => s.diceSpeed)
  const theme = useProfileStore((s) => s.boardTheme)
  const background = useProfileStore((s) => s.background)
  const selectSkin = useProfileStore((s) => s.selectSkin)
  const setSpeed = useProfileStore((s) => s.setDiceSpeed)
  const setTheme = useProfileStore((s) => s.setBoardTheme)
  const setBackground = useProfileStore((s) => s.setBackground)

  const owned = new Set(unlockedSkins(stats))
  const earned = ACHIEVEMENTS.filter((a) => isUnlocked(a, stats)).length

  return (
    <div className="screen screen--settings">
      <header className="settings__bar">
        <button type="button" className="iconbutton" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15.4 4.6 8 12l7.4 7.4" fill="none" stroke="currentColor" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <h2>Settings</h2>
      </header>

      <section className="settings__group">
        <h3>Board</h3>
        <div className="swatches">
          {BOARD_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`swatch ${theme === option.id ? 'is-selected' : ''}`}
              style={{ background: option.swatch }}
              onClick={() => setTheme(option.id)}
              aria-label={`${option.name} board`}
              aria-pressed={theme === option.id}
            >
              <span>{option.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings__group">
        <h3>Background</h3>
        <div className="swatches">
          {BACKGROUND_THEMES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`swatch swatch--sky ${background === option.id ? 'is-selected' : ''}`}
              style={{ background: option.swatch }}
              onClick={() => setBackground(option.id)}
              aria-label={`${option.name} background`}
              aria-pressed={background === option.id}
            >
              <span>{option.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="settings__group">
        <h3>
          Dice
          <em>{owned.size} of {Object.keys(DICE_SKINS).length} unlocked</em>
        </h3>
        <div className="skins">
          {Object.values(DICE_SKINS).map((option) => {
            const unlocked = owned.has(option.id)
            return (
              <button
                key={option.id}
                type="button"
                className={`skin ${skin === option.id ? 'is-selected' : ''} ${unlocked ? '' : 'is-locked'}`}
                style={{ background: option.body, color: option.pip }}
                disabled={!unlocked}
                onClick={() => selectSkin(option.id)}
                aria-label={unlocked ? `${option.name} dice` : `${option.name} dice, locked`}
              >
                {unlocked ? '⬤' : '🔒'}
              </button>
            )
          })}
        </div>
      </section>

      <section className="settings__group">
        <h3>Roll speed</h3>
        <div className="opponents">
          {(Object.keys(DICE_SPEED_RATES) as DiceSpeed[]).map((option) => (
            <button
              key={option}
              type="button"
              className={`opponent opponent--speed ${speed === option ? 'is-selected' : ''}`}
              onClick={() => setSpeed(option)}
            >
              {DICE_SPEED_LABELS[option]}
            </button>
          ))}
        </div>
      </section>

      <section className="settings__group">
        <h3>Record</h3>
        <dl className="stats">
          <div><dt>Games</dt><dd>{stats.gamesPlayed}</dd></div>
          <div><dt>Best</dt><dd>{stats.bestScore}</dd></div>
          <div><dt>Average</dt><dd>{averageScore(stats)}</dd></div>
          <div><dt>Yahtzees</dt><dd>{stats.yahtzees}</dd></div>
          <div><dt>Streak</dt><dd>{stats.dailyStreak}</dd></div>
          <div><dt>Awards</dt><dd>{earned}/{ACHIEVEMENTS.length}</dd></div>
        </dl>
      </section>
    </div>
  )
}
