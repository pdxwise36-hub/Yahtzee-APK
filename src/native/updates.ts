import { Capacitor } from '@capacitor/core'

/** Where the installed app looks for a newer copy of itself. The same
 *  deployment that serves the browser version, so one push updates both. */
const MANIFEST_URL = 'https://yahtzee-five.vercel.app/updates/manifest.json'

interface UpdateManifest {
  version: string
  url: string
}

/** Fetch a newer web bundle, if there is one, and stage it for next launch.
 *
 *  Deliberately not applied immediately: swapping the bundle reloads the
 *  webview, and doing that mid-turn would throw away the game in front of the
 *  player. Staged updates take effect the next time the app is opened.
 *
 *  Every failure path leaves the app on the bundle it already has. An update
 *  server that is down, slow or serving nonsense costs the player nothing. */
export async function initUpdates(): Promise<void> {
  // The plugin is native-only; on the web the page is already the latest.
  if (!Capacitor.isNativePlatform()) return

  try {
    const { CapacitorUpdater } = await import('@capgo/capacitor-updater')

    // Tells the plugin this bundle started successfully. Without it, the next
    // launch assumes the update broke the app and rolls back.
    await CapacitorUpdater.notifyAppReady()

    const response = await fetch(MANIFEST_URL, { cache: 'no-store' })
    if (!response.ok) return
    const manifest = (await response.json()) as UpdateManifest
    if (!manifest?.version || !manifest?.url) return

    const current = await CapacitorUpdater.current()
    if (current.bundle.version === manifest.version) return

    const bundle = await CapacitorUpdater.download({
      url: manifest.url,
      version: manifest.version,
    })
    await CapacitorUpdater.next({ id: bundle.id })
  } catch {
    // Staying on the current bundle is always an acceptable outcome.
  }
}
