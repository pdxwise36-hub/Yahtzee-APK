import { useEffect, useRef } from 'react'
import { DiceTable } from '@/dice3d/DiceTable'
import { useGameStore } from '@/state/gameStore'
import { DICE_SPEED_RATES, useProfileStore } from '@/state/profileStore'

export function DiceArea(): JSX.Element {
  const container = useRef<HTMLDivElement>(null)
  const table = useRef<DiceTable | null>(null)
  const skinId = useProfileStore((s) => s.selectedSkin)
  const diceSpeed = useProfileStore((s) => s.diceSpeed)

  useEffect(() => {
    const element = container.current
    if (!element) return

    const instance = new DiceTable({
      container: element,
      skinId: useProfileStore.getState().selectedSkin,
      playbackRate: DICE_SPEED_RATES[useProfileStore.getState().diceSpeed],
      // Reading the store lazily keeps the table from being rebuilt whenever
      // the hold handler identity changes.
      onDieTap: (index) => useGameStore.getState().hold(index),
    })
    table.current = instance
    useGameStore.getState().attachTable(instance)

    return () => {
      useGameStore.getState().attachTable(null)
      table.current = null
      instance.dispose()
    }
  }, [])

  // Swapping skins only rebuilds the dice materials, never the whole table.
  useEffect(() => {
    table.current?.setSkin(skinId)
  }, [skinId])

  useEffect(() => {
    table.current?.setPlaybackRate(DICE_SPEED_RATES[diceSpeed])
  }, [diceSpeed])

  return <div className="dice-area" ref={container} aria-hidden="true" />
}
