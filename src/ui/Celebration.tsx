import { useEffect, useMemo } from 'react'
import { useGameStore } from '@/state/gameStore'

const CONFETTI_COUNT = 28
const COLORS = ['#ffd85e', '#ff7a59', '#5ee0ff', '#9dff5e', '#ff5ec4']

/** The full-screen fanfare for a Yahtzee. Auto-dismisses so it never blocks
 *  the player mid-turn, and stays out of the way of the scorecard beneath. */
export function Celebration(): JSX.Element | null {
  const celebrating = useGameStore((s) => s.celebrating)
  const bonus = useGameStore((s) => s.celebratingBonus)
  const dismiss = useGameStore((s) => s.dismissCelebration)

  const confetti = useMemo(
    () =>
      Array.from({ length: CONFETTI_COUNT }, (_, i) => ({
        id: i,
        left: `${(i / CONFETTI_COUNT) * 100 + (Math.random() * 6 - 3)}%`,
        delay: `${Math.random() * 0.45}s`,
        duration: `${1.5 + Math.random() * 1.1}s`,
        color: COLORS[i % COLORS.length] as string,
        drift: `${(Math.random() * 2 - 1) * 90}px`,
        spin: `${Math.random() * 900 - 450}deg`,
      })),
    // Rebuilt per celebration so the confetti never falls the same way twice.
    [celebrating],
  )

  useEffect(() => {
    if (!celebrating) return
    const timer = window.setTimeout(dismiss, 2600)
    return () => window.clearTimeout(timer)
  }, [celebrating, dismiss])

  if (!celebrating) return null

  return (
    <div className="celebration" role="status" aria-live="polite" onClick={dismiss}>
      <div className="celebration__confetti" aria-hidden="true">
        {confetti.map((piece) => (
          <span
            key={piece.id}
            className="confetti"
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              animationDuration: piece.duration,
              background: piece.color,
              // Custom properties feed the keyframes, so each piece falls with
              // its own drift and spin instead of in lockstep.
              ['--drift' as string]: piece.drift,
              ['--spin' as string]: piece.spin,
            }}
          />
        ))}
      </div>
      <div className="celebration__stack">
        <div className="celebration__word">YAHTZEE!</div>
        {bonus && <div className="celebration__bonus">+100 BONUS</div>}
      </div>
    </div>
  )
}
