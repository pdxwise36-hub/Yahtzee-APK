import { describe, expect, it } from 'vitest'
import { MemoryTransport } from '@/net/memoryTransport'
import { MatchClient } from '@/net/MatchClient'
import { replay, isLegalMove, seatOf } from '@/net/replay'
import { generateCode, normaliseCode, type SignedMove } from '@/net/protocol'
import { diceValues, grandTotal, legalCategories } from '@/engine/game'
import { ALL_CATEGORIES } from '@/engine/types'
import { createRng } from '@/engine/rng'

async function twoPlayerMatch(latencyMs = 0) {
  const transport = new MemoryTransport({ latencyMs, seed: 7 })
  const setup = await transport.createMatch({
    variant: 'standard',
    seed: 20260817,
    host: { id: 'alice', name: 'Alice' },
  })
  await transport.joinMatch(setup.code, { id: 'bob', name: 'Bob' })
  await transport.startMatch(setup.matchId)

  const alice = new MatchClient(transport, setup, 'alice')
  const bob = new MatchClient(transport, setup, 'bob')
  await alice.connect()
  await bob.connect()
  return { transport, alice, bob, setup }
}

/** Play one whole turn for whichever client is up. */
async function playTurn(client: MatchClient): Promise<void> {
  await client.send({ type: 'roll' })
  const state = client.gameState
  const card = state.players[state.currentPlayer]?.cards[0] ?? {}
  const legal = legalCategories(diceValues(state), card, state.rules)
  const category = legal[0]
  if (!category) throw new Error('no legal category')
  await client.send({ type: 'score', category, column: 0 })
}

describe('join codes', () => {
  it('avoids characters that are easy to misread', () => {
    const rng = createRng(5)
    for (let i = 0; i < 400; i++) {
      const code = generateCode(() => rng.next())
      expect(code).toHaveLength(5)
      expect(code).not.toMatch(/[O0I1]/)
    }
  })

  it('normalises what a player types', () => {
    expect(normaliseCode(' ab-c d2 ')).toBe('ABCD2')
  })
})

describe('lobby', () => {
  it('seats players in join order', async () => {
    const transport = new MemoryTransport({ seed: 3 })
    const setup = await transport.createMatch({
      variant: 'standard', seed: 1, host: { id: 'a', name: 'A' },
    })
    const joined = await transport.joinMatch(setup.code, { id: 'b', name: 'B' })
    expect(joined.players.map((p) => p.seat)).toEqual([0, 1])
    expect(seatOf(joined, 'b')).toBe(1)
    expect(seatOf(joined, 'nobody')).toBe(-1)
  })

  it('is case and whitespace forgiving about the code', async () => {
    const transport = new MemoryTransport({ seed: 3 })
    const setup = await transport.createMatch({
      variant: 'standard', seed: 1, host: { id: 'a', name: 'A' },
    })
    await expect(
      transport.joinMatch(` ${setup.code.toLowerCase()} `, { id: 'b', name: 'B' }),
    ).resolves.toBeTruthy()
  })

  it('rejects an unknown code', async () => {
    const transport = new MemoryTransport({ seed: 3 })
    await expect(transport.joinMatch('ZZZZZ', { id: 'b', name: 'B' })).rejects.toThrow()
  })

  it('refuses joins once play has started', async () => {
    const transport = new MemoryTransport({ seed: 3 })
    const setup = await transport.createMatch({
      variant: 'standard', seed: 1, host: { id: 'a', name: 'A' },
    })
    await transport.startMatch(setup.matchId)
    await expect(transport.joinMatch(setup.code, { id: 'c', name: 'C' })).rejects.toThrow()
  })

  it('lets a player rejoin without taking a second seat', async () => {
    const transport = new MemoryTransport({ seed: 3 })
    const setup = await transport.createMatch({
      variant: 'standard', seed: 1, host: { id: 'a', name: 'A' },
    })
    await transport.joinMatch(setup.code, { id: 'b', name: 'B' })
    const again = await transport.joinMatch(setup.code, { id: 'b', name: 'B' })
    expect(again.players).toHaveLength(2)
  })
})

describe('two devices stay in step', () => {
  it('derives identical dice without ever sending them', async () => {
    const { alice, bob } = await twoPlayerMatch()
    await alice.send({ type: 'roll' })
    expect(diceValues(alice.gameState)).toEqual(diceValues(bob.gameState))
    // Nothing about the dice travelled: the log holds a bare roll.
    expect(alice.gameState.rollsUsed).toBe(1)
  })

  it('agrees on the whole game, move for move', async () => {
    const { alice, bob } = await twoPlayerMatch()
    for (let turn = 0; turn < ALL_CATEGORIES.length * 2; turn++) {
      const client = alice.myTurn ? alice : bob
      await playTurn(client)
      expect(bob.gameState.turnNumber).toBe(alice.gameState.turnNumber)
      expect(bob.gameState.currentPlayer).toBe(alice.gameState.currentPlayer)
    }
    expect(alice.gameState.phase).toBe('gameOver')
    expect(bob.gameState.phase).toBe('gameOver')
    for (let seat = 0; seat < 2; seat++) {
      expect(grandTotal(bob.gameState.players[seat]!, bob.gameState.rules)).toBe(
        grandTotal(alice.gameState.players[seat]!, alice.gameState.rules),
      )
    }
  })

  it('keeps holds in step across devices', async () => {
    const { alice, bob } = await twoPlayerMatch()
    await alice.send({ type: 'roll' })
    await alice.send({ type: 'hold', dieId: 2 })
    expect(bob.gameState.dice[2]?.held).toBe(true)
    await alice.send({ type: 'roll' })
    expect(diceValues(bob.gameState)).toEqual(diceValues(alice.gameState))
    expect(bob.gameState.dice[2]?.value).toBe(alice.gameState.dice[2]?.value)
  })
})

describe('a device cannot play out of turn', () => {
  it('refuses to send when it is not your turn', async () => {
    const { alice, bob } = await twoPlayerMatch()
    expect(alice.myTurn).toBe(true)
    expect(bob.myTurn).toBe(false)
    expect(await bob.send({ type: 'roll' })).toBe(false)
    expect(bob.gameState.rollsUsed).toBe(0)
  })

  it('rejects an out-of-turn move even if it reaches the log', async () => {
    const { transport, alice, setup } = await twoPlayerMatch()
    // A tampered client posting directly, bypassing its own checks.
    const forged: SignedMove = { seq: 0, seat: 1, move: { type: 'roll' } }
    await transport.submitMove(setup.matchId, forged)
    const snapshot = await transport.getSnapshot(setup.matchId)
    const { state, rejected } = replay(snapshot.setup, snapshot.moves)
    expect(rejected).toHaveLength(1)
    expect(state.rollsUsed).toBe(0)
    expect(alice.myTurn).toBe(true)
  })

  it('rejects scoring a box that is already filled', async () => {
    const { alice } = await twoPlayerMatch()
    await alice.send({ type: 'roll' })
    const state = alice.gameState
    expect(
      isLegalMove(state, { seq: 99, seat: 0, move: { type: 'score', category: 'chance', column: 0 } }),
    ).toBe(true)
    await alice.send({ type: 'score', category: 'chance', column: 0 })
    // Alice's turn is over, so she cannot immediately score again.
    expect(await alice.send({ type: 'score', category: 'chance', column: 0 })).toBe(false)
  })

  it('rejects rolling a fourth time', async () => {
    const { alice } = await twoPlayerMatch()
    expect(await alice.send({ type: 'roll' })).toBe(true)
    expect(await alice.send({ type: 'roll' })).toBe(true)
    expect(await alice.send({ type: 'roll' })).toBe(true)
    expect(await alice.send({ type: 'roll' })).toBe(false)
  })
})

describe('concurrency', () => {
  it('lets only one of two simultaneous submissions take a sequence number', async () => {
    const { transport, setup } = await twoPlayerMatch()
    const first = transport.submitMove(setup.matchId, { seq: 0, seat: 0, move: { type: 'roll' } })
    const second = transport.submitMove(setup.matchId, { seq: 0, seat: 1, move: { type: 'roll' } })
    const results = await Promise.all([first, second])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(results.filter((r) => r.conflict)).toHaveLength(1)
  })

  it('recovers when its sequence number is taken mid-flight', async () => {
    const { transport, alice, bob, setup } = await twoPlayerMatch()
    // Something lands in the log that Alice has not seen yet.
    await transport.submitMove(setup.matchId, { seq: 0, seat: 0, move: { type: 'roll' } })
    // Alice still believes the log is empty and retries into the right slot.
    expect(await alice.send({ type: 'hold', dieId: 0 })).toBe(true)
    const snapshot = await transport.getSnapshot(setup.matchId)
    expect(snapshot.moves.map((m) => m.seq)).toEqual([0, 1])
    await bob.connect()
    expect(bob.gameState.dice[0]?.held).toBe(true)
  })

  it('survives a laggy connection', async () => {
    const { alice, bob } = await twoPlayerMatch(5)
    for (let turn = 0; turn < 6; turn++) {
      await playTurn(alice.myTurn ? alice : bob)
    }
    expect(bob.gameState.turnNumber).toBe(alice.gameState.turnNumber)
  })
})

describe('reconnecting', () => {
  it('catches a device up purely from the move log', async () => {
    const { transport, alice, bob, setup } = await twoPlayerMatch()
    for (let turn = 0; turn < 5; turn++) {
      await playTurn(alice.myTurn ? alice : bob)
    }
    // A fresh device joins the match knowing only the seed and the log.
    const rejoined = new MatchClient(transport, setup, 'bob')
    await rejoined.connect()
    expect(rejoined.gameState.turnNumber).toBe(alice.gameState.turnNumber)
    expect(diceValues(rejoined.gameState)).toEqual(diceValues(alice.gameState))
    expect(grandTotal(rejoined.gameState.players[0]!, rejoined.gameState.rules)).toBe(
      grandTotal(alice.gameState.players[0]!, alice.gameState.rules),
    )
  })

  it('stops listening once disposed', async () => {
    const { alice, bob } = await twoPlayerMatch()
    const before = bob.gameState.rollsUsed
    bob.dispose()
    await alice.send({ type: 'roll' })
    expect(bob.gameState.rollsUsed).toBe(before)
  })
})
