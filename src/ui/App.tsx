import { useState } from 'react'
import { RULE_SETS, type VariantId } from '@/engine/types'
import { grandTotal } from '@/engine/game'
import { dailyKey, dailySeed } from '@/engine/rng'
import { DICE_SKINS } from '@/dice3d/diceGeometry'
import { unlockedSkins, averageScore } from '@/progression/achievements'
import { useGameStore, useTurnView } from '@/state/gameStore'
import { useProfileStore } from '@/state/profileStore'
import { DiceArea } from './DiceArea'
import { Scorecard } from './Scorecard'
import { Celebration } from './Celebration'
import { Rewards } from './Rewards'

function SkinPicker(): JSX.Element {
  const stats = useProfileStore((s) => s.stats)
  const selected = useProfileStore((s) => s.selectedSkin)
  const select = useProfileStore((s) => s.selectSkin)
  const unlocked = new Set(unlockedSkins(stats))

  return (
    <div className="skins" aria-label="Dice">
      {Object.values(DICE_SKINS).map((skin) => {
        const owned = unlocked.has(skin.id)
        return (
          <button
            key={skin.id}
            type="button"
            className={`skin ${selected === skin.id ? 'is-selected' : ''} ${owned ? '' : 'is-locked'}`}
            style={{ background: skin.body, color: skin.pip }}
            disabled={!owned}
            onClick={() => select(skin.id)}
            aria-label={owned ? skin.name : `${skin.name}, locked`}
            title={owned ? skin.name : 'Locked'}
          >
            {owned ? '⬤' : '🔒'}
          </button>
        )
      })}
    </div>
  )
}

interface StartProps {
  onStart: (variant: VariantId) => void
  onDaily: () => void
}

function StartScreen({ onStart, onDaily }: StartProps): JSX.Element {
  const stats = useProfileStore((s) => s.stats)
  const todayDone = stats.lastDailyKey === dailyKey()

  return (
    <div className="screen screen--start">
      <h1 className="title">YAHTZEE</h1>

      {stats.gamesPlayed > 0 && (
        <p className="statline">
          Best {stats.bestScore} · Average {averageScore(stats)} · {stats.gamesPlayed} games
        </p>
      )}

      <div className="variant-list">
        <button type="button" className="variant variant--daily" onClick={onDaily}>
          <strong>Daily Challenge {todayDone ? '✓' : ''}</strong>
          <span>
            Same dice for everyone today
            {stats.dailyStreak > 0 ? ` · ${stats.dailyStreak} day streak` : ''}
          </span>
        </button>

        {(Object.keys(RULE_SETS) as VariantId[]).map((id) => (
          <button key={id} type="button" className="variant" onClick={() => onStart(id)}>
            <strong>{RULE_SETS[id].name}</strong>
            <span>
              {RULE_SETS[id].diceCount} dice
              {RULE_SETS[id].columns > 1 ? ` · ${RULE_SETS[id].columns} columns` : ''}
            </span>
          </button>
        ))}
      </div>

      <SkinPicker />
    </div>
  )
}

function GameOver(): JSX.Element | null {
  const view = useTurnView()
  const newGame = useGameStore((s) => s.newGame)
  if (!view) return null

  return (
    <div className="screen screen--over">
      <h2>Final score</h2>
      <ol className="standings">
        {view.standings.map(({ player, total, rank }) => (
          <li key={player.id} className={rank === 1 ? 'is-winner' : ''}>
            <span className="standings__rank">{rank}</span>
            <span className="standings__name">{player.name}</span>
            <span className="standings__total">{total}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="button button--primary"
        onClick={() => newGame(view.game.rules.id, [{ id: 'p1', name: 'You' }])}
      >
        Play again
      </button>
    </div>
  )
}

function TopBar(): JSX.Element | null {
  const view = useTurnView()
  if (!view) return null

  return (
    <header className="topbar">
      {view.game.players.map((player, i) => (
        <div
          key={player.id}
          className={`player ${i === view.game.currentPlayer ? 'is-active' : ''}`}
        >
          <span className="player__name">{player.name}</span>
          <span className="player__score">{grandTotal(player, view.game.rules)}</span>
        </div>
      ))}
      <div className="topbar__turn">
        {view.game.turnNumber + 1}/{13 * view.game.rules.columns}
      </div>
    </header>
  )
}

/** The dice strip along the bottom of the board. The slots sit behind the 3D
 *  canvas, so an empty tray still reads as five places waiting for dice. */
function Tray(): JSX.Element | null {
  const view = useTurnView()
  if (!view) return null

  return (
    <div className="tray">
      <DiceArea />
    </div>
  )
}

function RollBar(): JSX.Element | null {
  const view = useTurnView()
  const roll = useGameStore((s) => s.roll)
  const rolling = useGameStore((s) => s.rolling)
  if (!view) return null

  const canRoll = view.rollsLeft > 0 && !rolling

  return (
    <div className="rollbar">
      <button
        type="button"
        className="rollbutton"
        disabled={!canRoll}
        onClick={() => void roll()}
      >
        <span className="rollbutton__label">{rolling ? 'Rolling' : 'Roll'}</span>
        <span className="rollbutton__pips">
          {Array.from({ length: view.game.rules.rollsPerTurn }, (_, i) => (
            <span key={i} className={`rollpip ${i < view.game.rollsUsed ? 'is-spent' : ''}`}>
              {i + 1}
            </span>
          ))}
        </span>
      </button>
      <p className="hint">
        {rolling
          ? ''
          : view.game.rollsUsed === 0
            ? 'Tap Roll to start your turn'
            : view.rollsLeft > 0
              ? 'Tap dice to keep them'
              : 'Choose a box to score'}
      </p>
    </div>
  )
}

export function App(): JSX.Element {
  const game = useGameStore((s) => s.game)
  const newGame = useGameStore((s) => s.newGame)
  const [started, setStarted] = useState(false)

  const start = (variant: VariantId): void => {
    newGame(variant, [{ id: 'p1', name: 'You' }])
    setStarted(true)
  }

  // Every player gets the same dice today, because the seed is the date.
  const startDaily = (): void => {
    newGame('standard', [{ id: 'p1', name: 'You' }], dailySeed(), dailyKey())
    setStarted(true)
  }

  if (!started || !game) {
    return (
      <div className="app">
        <StartScreen onStart={start} onDaily={startDaily} />
        <Rewards />
      </div>
    )
  }
  if (game.phase === 'gameOver') {
    return (
      <div className="app">
        <GameOver />
        <Rewards />
      </div>
    )
  }

  return (
    <div className="app">
      <TopBar />
      <Scorecard />
      <Tray />
      <RollBar />
      <Celebration />
    </div>
  )
}
