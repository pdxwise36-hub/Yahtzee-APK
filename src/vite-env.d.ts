/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Supabase project URL. Absent until online play is configured. */
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
