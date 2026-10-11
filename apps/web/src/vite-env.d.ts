declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

// Build-time env read by the app (Vite inlines import.meta.env.VITE_* at build).
interface ImportMetaEnv {
  /** Optional. Shared password of the seeded demo accounts; enables the demo quick-fill panel. */
  readonly VITE_DEMO_PASSWORD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
