/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean
  readonly PROD: boolean
  readonly VITE_UPLOAD_ENDPOINT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
