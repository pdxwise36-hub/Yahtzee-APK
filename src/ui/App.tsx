import { useEffect, useState } from 'react'
import { RULE_SETS, type VariantId } from '@/engine/types'
import { grandTotal, type AiLevel, type PlayerConfig } from '@/engine/game'
import { dailyKey, dailySeed } from '@/engine/rng'
import { averageScore } from '@/progression/achievements'
import { useGameStore, useTurnView } from '@/state/gameStore'
import { useProfileStore } from '@/state/profileStore'
import { DiceArea } from './DiceArea'
import { Scorecard } from './Scorecard'
import { ColumnTabs } from './ColumnTabs'
import { Celebration } from './Celebration'
import { Rewards } from './Rewards'
import { Lobby } from './Lobby'
import { Settings } from './Settings'
import { applyBackgroundTheme, applyBoardTheme } from './themes'
import { useOnlineStore } from '@/state/onlineStore'

const OPPONENTS: { id: AiLevel | 'solo'; label: string }[] = [
  { id: 'solo', label: 'Solo' },
  { id: 'easy', label: 'Easy' },
  { id: 'medium', label: 'Medium' },
  { id: 'hard', label: 'Hard' },
  { id: 'expert', label: 'Expert' },
]

interface StartProps {
  onStart: (variant: VariantId) => void
  onDaily: () => void
  onOnline: () => void
  onSettings: () => void
  opponent: AiLevel | 'solo'
  onOpponent: (id: AiLevel | 'solo') => void
}

function StartScreen({
  onStart, onDaily, onOnline, onSettings, opponent, onOpponent,
}: StartProps): JSX.Element {
  const stats = useProfileStore((s) => s.stats)
  const todayDone = stats.lastDailyKey === dailyKey()

  return (
    <div className="screen screen--start">
      <button
        type="button"
        className="iconbutton iconbutton--corner"
        onClick={onSettings}
        aria-label="Settings"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 15.6a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2Z" fill="none"
            stroke="currentColor" strokeWidth="2" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.56-1H1a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 2.6 7a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 7 2.6h.08A1.7 1.7 0 0 0 8.6 1V1a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 21.4 7v.08a1.7 1.7 0 0 0 1.56 1.02H23a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1Z"
            fill="none" stroke="currentColor" strokeWidth="1.6" transform="scale(0.86) translate(2 2)" />
        </svg>
      </button>

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

        <button type="button" className="variant variant--online" onClick={onOnline}>
          <strong>Play Online</strong>
          <span>Each player on their own device</span>
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

function TopBar({ onHome }: { onHome: () => void }): JSX.Element | null {
  const view = useTurnView()
  if (!view) return null

  return (
    <header className="topbar">
      <button type="button" className="iconbutton" onClick={onHome} aria-label="Back to menu">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2.6 11.2h2.7V21h5.2v-6h3v6h5.2v-9.8h2.7Z" fill="currentColor" />
        </svg>
      </button>
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
  const match = useGameStore((s) => s.match)
  if (!view) return null

  const isAi = view.player.isAI
  const theirTurn = match !== null && !match.myTurn
  const canRoll = view.rollsLeft > 0 && !rolling && !aiThinking && !isAi && !theirTurn

  return (
    <div className="rollbar">
      <button
        type="button"
        className="rollbutton"
        disabled={!canRoll}
        onClick={() => void roll()}
      >
        <span className="rollbutton__label">
          {rolling ? 'Rolling' : isAi || theirTurn ? `${view.player.name}…` : 'Roll'}
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
          : theirTurn
            ? `Waiting for ${view.player.name}`
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
  const [screen, setScreen] = useState<'menu' | 'lobby' | 'settings'>('menu')
  const [confirmingHome, setConfirmingHome] = useState(false)
  const [opponent, setOpponent] = useState<AiLevel | 'solo'>('solo')
  const onlineStatus = useOnlineStore((s) => s.status)
  const onlineSetup = useOnlineStore((s) => s.setup)
  const onlineActive = onlineSetup !== null && onlineStatus === 'playing'
  const boardTheme = useProfileStore((s) => s.boardTheme)
  const background = useProfileStore((s) => s.background)

  // Themes paint CSS variables on the document, so this runs outside React's
  // tree and has to be reapplied whenever a choice changes.
  useEffect(() => {
    applyBoardTheme(boardTheme)
  }, [boardTheme])

  useEffect(() => {
    applyBackgroundTheme(background)
  }, [background])

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

  /** Abandon whatever is in progress and return to the menu. An online match
   *  is left properly rather than merely hidden, so its listener is torn down
   *  and it can be resumed later from the lobby. */
  const goHome = (): void => {
    useOnlineStore.getState().leave()
    setConfirmingHome(false)
    setStarted(false)
    setScreen('menu')
  }

  const requestHome = (): void => {
    // Nothing is at stake before the first box is filled.
    const inProgress = game !== null && game.phase !== 'gameOver' && game.history.length > 0
    if (inProgress) setConfirmingHome(true)
    else goHome()
  }

  if (screen === 'settings' && !onlineActive) {
    return (
      <div className="app">
        <Settings onBack={() => setScreen('menu')} />
      </div>
    )
  }

  if (screen === 'lobby' && !onlineActive) {
    return (
      <div className="app">
        <Lobby onBack={() => setScreen('menu')} />
      </div>
    )
  }

  if ((!started && !onlineActive) || !game) {
    return (
      <div className="app">
        <StartScreen
          onStart={start}
          onDaily={startDaily}
          onOnline={() => setScreen('lobby')}
          onSettings={() => setScreen('settings')}
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
      <TopBar onHome={requestHome} />
      <ColumnTabs />
      <Scorecard />
      <Tray />
      <RollBar />
      <Celebration />
      {confirmingHome && (
        <div className="rewards" role="dialog" aria-label="Leave game">
          <div className="rewards__panel">
            <h2 className="rewards__title">Leave this game?</h2>
            <p className="confirm__body">
              {onlineActive
                ? 'You can rejoin it later from the online menu.'
                : 'This game will not be saved.'}
            </p>
            <button type="button" className="button button--primary" onClick={goHome}>
              Leave
            </button>
            <button
              type="button"
              className="linkbutton"
              onClick={() => setConfirmingHome(false)}
            >
              Keep playing
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
