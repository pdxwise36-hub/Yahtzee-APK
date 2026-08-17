# Yahtzee

A mobile Yahtzee game: 3D physics dice, AI opponents, daily challenges,
unlockables, and online multiplayer, packaged as an Android APK.

## Running it

```bash
npm install
npm run dev          # play it in a browser
npm test             # rules engine, dice physics, AI and multiplayer
npm run typecheck
```

`npm run shots` drives the built game in a real browser and captures the
table, printing the engine's hand so the rendered dice faces can be checked
against what was actually rolled.

## Installing on a phone

Every push builds a debug APK in CI and publishes it to the `latest-debug`
release, which installs directly on any Android 7.0+ device. To build one
locally you need the Android SDK:

```bash
npm run android:apk   # android/app/build/outputs/apk/debug/
```

A signed release APK is built automatically once these repository secrets
exist: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.

## How it fits together

```
src/engine/     Rules: scoring, variants, turn state. Pure and fully tested.
src/dice3d/     Three.js rendering and cannon-es physics.
src/ai/         Opponents, from a naive one to an expected-value search.
src/net/        Online multiplayer: wire protocol, replay, transports.
src/progression/Stats, achievements and unlockables.
src/ui/         React screens.
```

Two decisions shape most of the code:

**The engine owns the dice, not the physics.** Each throw is simulated
headlessly to rest, then every recorded frame is given one fixed rotation that
relabels the die's faces so it lands on the value the engine rolled. The
tumble on screen is real physics frame for frame, but the result is decided in
advance. Without this, seeded daily challenges and networked play could not be
reproducible.

**A match is a seed plus a list of moves.** Nothing else is stored or
transmitted. Because the engine is deterministic, every device replaying the
same log derives identical dice, so desynchronised dice are impossible by
construction and each message is a few bytes.

## Enabling online multiplayer

Online play is optional and dormant until pointed at a backend. Without one
the game runs fully offline, including AI opponents and daily challenges.

1. Apply `supabase/migrations/0001_multiplayer.sql` to a Supabase project. It
   creates its own `yahtzee` schema, so it is safe to apply to a project that
   already hosts something else.
2. Enable anonymous sign-ins in the project's auth settings. Players get a
   durable identity without having to register.
3. Provide the project's credentials at build time:

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key>
```

### How the multiplayer holds together

The backend stores intentions, never outcomes, and never interprets the game.

- The move log's primary key is `(match_id, seq)`, so two devices racing to
  submit the same move cannot both win. The loser refetches and reconsiders.
- Row-level security limits a player to appending moves for their own seat in
  a match that is actually in progress, and the log is append-only.
- Whose turn it is is not judged in SQL, which would mean reimplementing the
  rules there. Instead every client rejects out-of-turn moves while replaying,
  so a forged one is ignored everywhere. Since dice come from the seed, there
  is nothing to gain by posting one.

`MemoryTransport` implements the same contract in-process, which is how the
multiplayer rules are tested end to end — turn stealing, sequence-number
races, laggy connections and reconnects — with no network or database.
