import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { progressDone, progressStart } from '@/lib/progress';

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/',
  withCredentials: true,
  withXSRFToken: true,
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
});

let csrfPromise: Promise<void> | null = null;

/**
 * Make sure a CSRF cookie is in hand before a write.
 *
 * The fetch is shared, so a burst of writes asks the server once — but a
 * failure is never kept: a rejected promise left in place would hand the same
 * stale error to every later write. `force` throws the cached one away, which
 * is how a token that has gone stale gets replaced.
 */
export async function ensureCsrf(force = false): Promise<void> {
  if (force) csrfPromise = null;
  if (!csrfPromise) {
    csrfPromise = http.get('/sanctum/csrf-cookie')
      .then(() => undefined)
      .catch((e: unknown) => { csrfPromise = null; throw e; });
  }
  return csrfPromise;
}

http.interceptors.request.use(async (config) => {
  const method = (config.method ?? 'get').toLowerCase();
  if (['post', 'put', 'patch', 'delete'].includes(method)) {
    await ensureCsrf();
  }
  return config;
});

// Every call, however it ends, moves the progress bar. Registered as a pair so
// a failed request can never leave the bar running.
http.interceptors.request.use((config) => { progressStart(); return config; });
http.interceptors.response.use(
  (res) => { progressDone(); return res; },
  (err) => { progressDone(); return Promise.reject(err); },
);

/**
 * A session token goes stale on its own — a tab left open past the session
 * lifetime, or a server that lost its session store for a moment — and Laravel
 * answers 419 "CSRF token mismatch". The operator did nothing wrong, so fetch a
 * fresh cookie and replay the call once instead of showing them that. The flag
 * on the config stops a genuinely rejected write from looping.
 */
http.interceptors.response.use(undefined, async (err: AxiosError) => {
  const cfg = err.config as (InternalAxiosRequestConfig & { csrfRetried?: boolean }) | undefined;
  if (err.response?.status !== 419 || !cfg || cfg.csrfRetried) return Promise.reject(err);

  cfg.csrfRetried = true;
  cfg.headers?.delete?.('X-XSRF-TOKEN');
  await ensureCsrf(true);
  return http(cfg);
});

export type ApiError = AxiosError<{ message?: string; errors?: Record<string, string[]> }>;

export function apiErrorMessage(e: unknown, fallback = 'Something went wrong'): string {
  const err = e as ApiError;
  if (err?.response?.data?.errors) {
    return Object.values(err.response.data.errors).flat().join(' ');
  }
  return err?.response?.data?.message || err?.message || fallback;
}
