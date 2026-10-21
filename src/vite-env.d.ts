/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Browser error tracking; unset disables it. Read at build time. */
  readonly VITE_SENTRY_DSN?: string;
}
