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

## Updating an installed app

The APK is a browser window around the built web app. Frozen inside the APK
those files could only change by reinstalling, so the installed app fetches
them itself instead: on launch it asks the deployment for a manifest, and if a
newer bundle exists it downloads it and stages it for the next launch. Only
genuinely native changes — the icon, permissions, a new plugin — still need a
new APK.

Updates are staged rather than applied on the spot, because swapping the
bundle reloads the webview and doing that mid-turn would throw away the game
in front of the player. Every failure path leaves the app on the bundle it
already has, so an update server that is down or slow costs nothing.

The bundle is published by the same Vercel build that serves the browser
version, so one push updates both. It is skipped on other builds, or the APK
would ship a copy of the site inside itself.

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

Online play is optional and dormant until pointed at a backend. Without one the
game runs fully offline, including AI opponents and daily challenges, and
neither backend SDK is included in the build at all.

Firebase is the default. Supabase is also implemented; see below.

1. Create a Firebase project and add a Web app to it.
2. Turn on **Anonymous** sign-in under Authentication. Players get a durable
   identity without ever registering.
3. Create a Firestore database.
4. Deploy the rules from `firebase/`:

   ```bash
   cd firebase && firebase deploy --only firestore:rules
   ```

5. Provide the Web app's config at build time:

   ```bash
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=<project>
   VITE_FIREBASE_APP_ID=...
   ```

To use Supabase instead, apply `supabase/migrations/0001_multiplayer.sql` to a
project, enable anonymous sign-ins, and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY`. The migration creates its own `yahtzee` schema, so it
is safe to apply to a project that already hosts something else. Whichever is
configured wins; Firebase takes precedence if both are.

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

### Using a different backend

Exactly one file talks to Supabase. The protocol, the replay logic, the match
client and every multiplayer test are vendor-neutral, so swapping backends
means writing one implementation of a six-method interface.

The only part that needs care is the guarantee that two devices cannot both
claim the same move. Each candidate expresses it differently:

| Backend   | First-writer-wins                                     |
| --------- | ----------------------------------------------------- |
| Firestore | sequence as document id; `allow create`, updates denied |
| Supabase  | primary key on `(match_id, seq)`                      |
| Appwrite  | `createDocument` with an explicit id returns conflict  |

Backend clients are imported dynamically, so the SDK is a separate chunk that
downloads only when someone opens the lobby, and is dropped entirely from the
build when no backend is configured. A heavier SDK therefore costs the offline
game nothing.
