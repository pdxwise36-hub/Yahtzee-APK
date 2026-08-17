import { describe, expect, it } from 'vitest'
import { FirebaseTransport } from '@/net/firebaseTransport'
import { MatchClient } from '@/net/MatchClient'
import { replay } from '@/net/replay'
import { diceValues } from '@/engine/game'

/** Exercises the real Firestore project and its published security rules.
 *
 *  Skipped by default: it needs network, touches the live project and spends
 *  its quota, so CI must not run it. Run deliberately with:
 *
 *      FIREBASE_INTEGRATION=1 npx vitest run tests/firebase.integration.test.ts
 *
 *  It is the only way to check rules written without an emulator, and it
 *  covers the things that are easy to get wrong when writing them blind:
 *  hosting, joining, seat assignment, and the refusals that matter. */
const CONFIG = {
  apiKey: 'AIzaSyA9DhsVUgIDdmGNThpATTURKtBlyOgseP4',
  authDomain: 'yahtzeeplus.firebaseapp.com',
  projectId: 'yahtzeeplus',
  appId: '1:919425728334:web:32615eac0070c7e326e81f',
}

const enabled = process.env.FIREBASE_INTEGRATION === '1'

describe.skipIf(!enabled)('live Firebase project', () => {
  it('plays a match across two independent clients', async () => {
    const hostSide = new FirebaseTransport({ ...CONFIG, instanceName: 'host' })
    const guestSide = new FirebaseTransport({ ...CONFIG, instanceName: 'guest' })

    // 1. Anonymous sign-in must be enabled for either player to do anything.
    const hostId = await hostSide.ensureSession()
    const guestId = await guestSide.ensureSession()
    expect(hostId).toBeTruthy()
    expect(guestId).toBeTruthy()
    expect(hostId).not.toBe(guestId)

    // 2. Hosting writes the match and the host's own seat in one transaction,
    //    which is the case the rules need a special allowance for.
    const setup = await hostSide.createMatch({
      variant: 'standard',
      seed: 424242,
      host: { id: hostId, name: 'Host' },
    })
    expect(setup.code).toHaveLength(5)

    // 3. Joining by code takes the next free seat.
    const joined = await guestSide.joinMatch(setup.code, { id: guestId, name: 'Guest' })
    expect(joined.players).toHaveLength(2)
    expect(joined.players.find((p) => p.id === guestId)?.seat).toBe(1)

    // 4. Moves are refused until the host starts the match.
    const tooEarly = await hostSide.submitMove(setup.matchId, {
      seq: 0, seat: 0, move: { type: 'roll' },
    })
    expect(tooEarly.ok).toBe(false)

    await hostSide.startMatch(setup.matchId)

    // 5. A player may append for their own seat.
    const rolled = await hostSide.submitMove(setup.matchId, {
      seq: 0, seat: 0, move: { type: 'roll' },
    })
    expect(rolled.ok).toBe(true)

    // 6. But never for somebody else's.
    const impersonation = await guestSide.submitMove(setup.matchId, {
      seq: 1, seat: 0, move: { type: 'roll' },
    })
    expect(impersonation.ok).toBe(false)

    // 7. And history cannot be rewritten.
    const overwrite = await hostSide.submitMove(setup.matchId, {
      seq: 0, seat: 0, move: { type: 'score', category: 'chance', column: 0 },
    })
    expect(overwrite.ok).toBe(false)
    expect(overwrite.conflict).toBe(true)

    // 8. Both devices derive the same dice from the log, having never sent one.
    const hostClient = new MatchClient(hostSide, setup, hostId)
    const guestClient = new MatchClient(guestSide, joined, guestId)
    await hostClient.connect()
    await guestClient.connect()
    expect(diceValues(guestClient.gameState)).toEqual(diceValues(hostClient.gameState))
    expect(hostClient.gameState.rollsUsed).toBe(1)

    // 9. A real turn, played through the client rather than raw submissions.
    expect(await hostClient.send({ type: 'hold', dieId: 0 })).toBe(true)
    expect(await hostClient.send({ type: 'roll' })).toBe(true)
    expect(await guestClient.send({ type: 'roll' })).toBe(false) // not their turn

    const snapshot = await hostSide.getSnapshot(setup.matchId)
    const { rejected } = replay(snapshot.setup, snapshot.moves)
    expect(rejected).toHaveLength(0)

    console.log(
      `match ${setup.code}: ${snapshot.moves.length} moves, dice ${diceValues(hostClient.gameState).join('')}`,
    )

    hostClient.dispose()
    guestClient.dispose()
  }, 90_000)
})
