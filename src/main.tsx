import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { useGameStore } from './state/gameStore'
import './styles/index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

// Debug handle for end-to-end tests, which need the authoritative hand to
// compare against what is actually drawn on the table.
;(window as unknown as { __yahtzee: typeof useGameStore }).__yahtzee = useGameStore

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
