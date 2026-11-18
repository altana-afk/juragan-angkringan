/** Konfigurasi Firebase dari variabel build (VITE_FIREBASE_*). Kosong = fitur akun disembunyikan. */
const env = import.meta.env;
export const FIREBASE_CONFIG = {
  apiKey: (env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ?? '',
  authDomain: (env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() ?? '',
  projectId: (env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ?? '',
  appId: (env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ?? '',
};

export function cloudConfigured(): boolean {
  return Boolean(FIREBASE_CONFIG.apiKey && FIREBASE_CONFIG.authDomain && FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.appId);
}
