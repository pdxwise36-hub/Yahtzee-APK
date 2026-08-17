import { useState } from 'react'
import { RULE_SETS, type VariantId } from '@/engine/types'
import { normaliseCode } from '@/net/protocol'
import { isOnlineConfigured, useOnlineStore } from '@/state/onlineStore'

/** Create or join a match, then wait for the other players. */
export function Lobby({ onBack }: { onBack: () => void }): JSX.Element {
  const { setup, status, busy, error, playerId, playerName } = useOnlineStore()
  const host = useOnlineStore((s) => s.host)
  const join = useOnlineStore((s) => s.join)
  const start = useOnlineStore((s) => s.start)
  const leave = useOnlineStore((s) => s.leave)
  const setPlayerName = useOnlineStore((s) => s.setPlayerName)

  const [code, setCode] = useState('')
  const [variant, setVariant] = useState<VariantId>('standard')

  if (setup && status === 'lobby') {
    const isHost = setup.hostId === playerId
    return (
      <div className="screen screen--start">
        <h2 className="lobby__title">Waiting for players</h2>
        <p className="lobby__hint">Share this code so they can join</p>
        <div className="lobby__code" aria-label={`Join code ${setup.code.split('').join(' ')}`}>
          {setup.code}
        </div>

        <ul className="lobby__players">
          {setup.players.map((player) => (
            <li key={player.id}>
              <span>{player.name}</span>
              {player.id === setup.hostId && <em>host</em>}
            </li>
          ))}
        </ul>

        {!isOnlineConfigured && (
          <p className="lobby__warning">
            No backend configured, so this lobby is local only — another device
            cannot join it yet.
          </p>
        )}
        {error && <p className="lobby__error">{error}</p>}

        {isHost ? (
          <button
            type="button"
            className="button button--primary"
            disabled={busy || setup.players.length < 2}
            onClick={() => void start()}
          >
            {setup.players.length < 2 ? 'Need another player' : 'Start game'}
          </button>
        ) : (
          <p className="lobby__hint">Waiting for the host to start…</p>
        )}

        <button type="button" className="linkbutton" onClick={leave}>
          Leave
        </button>
      </div>
    )
  }

  return (
    <div className="screen screen--start">
      <h2 className="lobby__title">Play online</h2>

      <label className="field">
        <span>Your name</span>
        <input
          value={playerName}
          maxLength={16}
          onChange={(event) => setPlayerName(event.target.value)}
        />
      </label>

      <div className="variant-list">
        {(Object.keys(RULE_SETS) as VariantId[]).map((id) => (
          <button
            key={id}
            type="button"
            className={`variant ${variant === id ? 'is-selected' : ''}`}
            onClick={() => setVariant(id)}
          >
            <strong>{RULE_SETS[id].name}</strong>
            <span>{RULE_SETS[id].diceCount} dice</span>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="button button--primary"
        disabled={busy}
        onClick={() => void host(variant)}
      >
        Host a game
      </button>

      <div className="joinrow">
        <input
          value={code}
          placeholder="CODE"
          maxLength={5}
          aria-label="Join code"
          onChange={(event) => setCode(normaliseCode(event.target.value))}
        />
        <button
          type="button"
          className="button button--primary"
          disabled={busy || code.length < 5}
          onClick={() => void join(code)}
        >
          Join
        </button>
      </div>

      {!isOnlineConfigured && (
        <p className="lobby__warning">
          Online play needs a backend. Set VITE_SUPABASE_URL and
          VITE_SUPABASE_ANON_KEY to enable it.
        </p>
      )}
      {error && <p className="lobby__error">{error}</p>}

      <button type="button" className="linkbutton" onClick={onBack}>
        Back
      </button>
    </div>
  )
}
