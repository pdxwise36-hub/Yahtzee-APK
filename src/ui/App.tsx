import { useState } from 'react'
import { RULE_SETS, type VariantId } from '@/engine/types'
import { grandTotal } from '@/engine/game'
import { useGameStore, useTurnView } from '@/state/gameStore'
import { DiceArea } from './DiceArea'
import { Scorecard } from './Scorecard'
import { Celebration } from './Celebration'

function StartScreen({ onStart }: { onStart: (variant: VariantId) => void }): JSX.Element {
  return (
    <div className="screen screen--start">
      <h1 className="title">
        <span>YAHTZEE</span>
      </h1>
      <p className="subtitle">Roll five dice. Press your luck.</p>
      <div className="variant-list">
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

function TurnBar(): JSX.Element | null {
  const view = useTurnView()
  if (!view) return null
  const total = grandTotal(view.player, view.game.rules)

  return (
    <header className="turn-bar">
      <div className="turn-bar__player">
        <span className="turn-bar__name">{view.player.name}</span>
        <span className="turn-bar__turn">
          Turn {view.game.turnNumber + 1} / {13 * view.game.rules.columns}
        </span>
      </div>
      <div className="turn-bar__score">{total}</div>
    </header>
  )
}

function Controls(): JSX.Element | null {
  const view = useTurnView()
  const roll = useGameStore((s) => s.roll)
  const rolling = useGameStore((s) => s.rolling)
  if (!view) return null

  const canRoll = view.rollsLeft > 0 && !rolling
  const label = view.game.rollsUsed === 0 ? 'Roll' : `Roll again`

  return (
    <div className="controls">
      <div className="rolls" aria-label={`${view.rollsLeft} rolls left`}>
        {Array.from({ length: view.game.rules.rollsPerTurn }, (_, i) => (
          <span key={i} className={`pip ${i < view.rollsLeft ? 'is-left' : ''}`} />
        ))}
      </div>
      <button
        type="button"
        className="button button--primary button--roll"
        disabled={!canRoll}
        onClick={() => void roll()}
      >
        {rolling ? 'Rolling…' : label}
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

  return (
    <div className="app">
      {/* The table is mounted for the whole session so the WebGL context and
          its textures survive navigation between screens. */}
      <div className={`table-layer ${started && game ? 'is-active' : ''}`}>
        <DiceArea />
      </div>

      {!started || !game ? (
        <StartScreen onStart={start} />
      ) : game.phase === 'gameOver' ? (
        <GameOver />
      ) : (
        <div className="screen screen--game">
          <TurnBar />
          <div className="table-spacer" />
          <Controls />
          <Scorecard />
        </div>
      )}
      <Celebration />
    </div>
  )
}
