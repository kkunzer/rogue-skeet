declare const __BUILD_SHA__: string | undefined;

/** Git short SHA injected by Vite at build time ('dev' when unavailable). */
export const BUILD_SHA: string = typeof __BUILD_SHA__ === 'string' ? __BUILD_SHA__ : 'dev';
