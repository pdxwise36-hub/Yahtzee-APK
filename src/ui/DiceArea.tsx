import { useEffect, useRef } from 'react'
import { DiceTable } from '@/dice3d/DiceTable'
import { useGameStore } from '@/state/gameStore'

export function DiceArea(): JSX.Element {
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = container.current
    if (!element) return

    const table = new DiceTable({
      container: element,
      // Reading the store lazily keeps the table from being rebuilt whenever
      // the hold handler identity changes.
      onDieTap: (index) => useGameStore.getState().hold(index),
    })
    useGameStore.getState().attachTable(table)

    return () => {
      useGameStore.getState().attachTable(null)
      table.dispose()
    }
  }, [])

  return <div className="dice-area" ref={container} aria-hidden="true" />
}
