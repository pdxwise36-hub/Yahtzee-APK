import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pdxwise.yahtzee',
  appName: 'Yahtzee',
  webDir: 'dist',
  android: {
    // The game draws its own background; letting the webview paint white first
    // causes a bright flash on launch against the deep blue table.
    backgroundColor: '#0b5798',
  },
  server: {
    androidScheme: 'https',
  },
}

export default config
