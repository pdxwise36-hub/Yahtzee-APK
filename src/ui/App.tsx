import { useEffect, useState } from 'react'
import { RULE_SETS, type VariantId } from '@/engine/types'
import { grandTotal, type AiLevel, type PlayerConfig } from '@/engine/game'
import { dailyKey, dailySeed } from '@/engine/rng'
import { DICE_SKINS } from '@/dice3d/diceGeometry'
import { unlockedSkins, averageScore } from '@/progression/achievements'
import { useGameStore, useTurnView } from '@/state/gameStore'
import {
  DICE_SPEED_LABELS,
  DICE_SPEED_RATES,
  useProfileStore,
  type DiceSpeed,
} from '@/state/profileStore'
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

const OPPONENTS: { id: AiLevel | 'solo'; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
]

function SpeedButton({ speed }: { speed: DiceSpeed }): JSX.Element {
  const current = useProfileStore((s) => s.diceSpeed)
  const setSpeed = useProfileStore((s) => s.setDiceSpeed)
  return (
    <button
      type="button"
      className={`opponent opponent--speed ${current === speed ? 'is-selected' : ''}`}
      onClick={() => setSpeed(speed)}
    >
      {DICE_SPEED_LABELS[speed]}
    </button>
  )
}

interface StartProps {
  onStart: (variant: VariantId) => void
  onDaily: () => void
  opponent: AiLevel | 'solo'
  onOpponent: (id: AiLevel | 'solo') => void
}

function StartScreen({ onStart, onDaily, opponent, onOpponent }: StartProps): JSX.Element {
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

      <div className="opponents" role="group" aria-label="Dice speed">
        {(Object.keys(DICE_SPEED_RATES) as DiceSpeed[]).map((speed) => (
          <SpeedButton key={speed} speed={speed} />
        ))}
      </div>

      <div className="opponents" role="group" aria-label="Opponent">
        {OPPONENTS.map((choice) => (
          <button
            key={choice.id}
            type="button"
            className={`opponent ${opponent === choice.id ? 'is-selected' : ''}`}
            onClick={() => onOpponent(choice.id)}
          >
            {choice.label}
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
  const aiThinking = useGameStore((s) => s.aiThinking)
  if (!view) return null

  const isAi = view.player.isAI
  const canRoll = view.rollsLeft > 0 && !rolling && !aiThinking && !isAi

  return (
    <div className="rollbar">
      <button
        type="button"
        className="rollbutton"
        disabled={!canRoll}
        onClick={() => void roll()}
      >
        <span className="rollbutton__label">
          {rolling ? 'Rolling' : isAi ? `${view.player.name}…` : 'Roll'}
        </span>
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
          : isAi
            ? `${view.player.name} is thinking`
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
  const runAiTurn = useGameStore((s) => s.runAiTurn)
  const [started, setStarted] = useState(false)
  const [opponent, setOpponent] = useState<AiLevel | 'solo'>('solo')

  const roster = (): PlayerConfig[] => {
    const you: PlayerConfig = { id: 'p1', name: 'You' }
    if (opponent === 'solo') return [you]
    return [
      you,
      { id: 'cpu', name: 'CPU', isAI: true, aiLevel: opponent },
    ]
  }

  const start = (variant: VariantId): void => {
    newGame(variant, roster())
    setStarted(true)
  }

  // Every player gets the same dice today, because the seed is the date.
  const startDaily = (): void => {
    newGame('standard', roster(), dailySeed(), dailyKey())
    setStarted(true)
  }

  // Hand over to the AI whenever the turn reaches one, rather than waiting for
  // a tap the player has no way to make.
  const isAiTurn =
    game !== null &&
    game.phase === 'awaitingRoll' &&
    (game.players[game.currentPlayer]?.isAI ?? false)

  useEffect(() => {
    if (isAiTurn) void runAiTurn()
  }, [isAiTurn, game?.currentPlayer, game?.turnNumber, runAiTurn])

  if (!started || !game) {
    return (
      <div className="app">
        <StartScreen
          onStart={start}
          onDaily={startDaily}
          opponent={opponent}
          onOpponent={setOpponent}
        />
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
