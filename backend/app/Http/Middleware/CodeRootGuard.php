<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Throwable;

/**
 * CodeRoot site guard.
 *
 * Asks CodeRoot's status address whether this site may stay online, at most
 * once every few minutes, and trusts only answers signed with this site's
 * secret. While the answer is "blocked", every request gets a 503 page.
 *
 * It never blocks a site it cannot get an answer for: on any failure the last
 * accepted answer is kept, and with no accepted answer yet the site stays up.
 *
 * Settings live in config/services.php ('coderoot'), read from .env:
 * CODEROOT_SITE_KEY, CODEROOT_SITE_SECRET, CODEROOT_STATUS_URL.
 */
class CodeRootGuard
{
    /** Paths that keep working while blocked (e.g. a payment page). */
    private const ALWAYS_ALLOW = [
        // 'api/payments/callback',
    ];

    private const CACHE_SECONDS = 300;
    private const RETRY_SECONDS = 120;
    private const MAX_CLOCK_SKEW = 600;
    private const TIMEOUT_SECONDS = 5;

    private const STATE_KEY = 'coderoot-guard:state';
    private const NEXT_CHECK_KEY = 'coderoot-guard:next-check';

    public function handle(Request $request, Closure $next)
    {
        $key = (string) config('services.coderoot.site_key');
        $secret = (string) config('services.coderoot.secret');

        // Not configured (e.g. local development): do nothing.
        if ($key === '' || $secret === '') {
            return $next($request);
        }

        if ($request->isMethod('OPTIONS') || (self::ALWAYS_ALLOW && $request->is(...self::ALWAYS_ALLOW))) {
            return $next($request);
        }

        try {
            $state = $this->state($key, $secret);
        } catch (Throwable $e) {
            // A broken cache or network must never take the site down.
            $state = null;
        }

        if (($state['status'] ?? 'active') !== 'blocked') {
            return $next($request);
        }

        return $this->blockedResponse($request, $state);
    }

    /** The last accepted answer, refreshed when it is due. */
    private function state(string $key, string $secret): ?array
    {
        $store = Cache::store();
        $state = $store->get(self::STATE_KEY);
        $now = time();

        if ($now < (int) $store->get(self::NEXT_CHECK_KEY, 0)) {
            return $state;
        }

        // Claim the check first so a burst of requests asks only once; if the
        // check fails, this is also the 2-minute retry.
        $store->forever(self::NEXT_CHECK_KEY, $now + self::RETRY_SECONDS);

        $fresh = $this->fetch($key, $secret);
        if ($fresh === null) {
            return $state;
        }

        $store->forever(self::STATE_KEY, $fresh);
        $store->forever(self::NEXT_CHECK_KEY, $now + $fresh['cache_seconds']);

        return $fresh;
    }

    /** Ask the status address; null unless the answer is signed and fresh. */
    private function fetch(string $key, string $secret): ?array
    {
        $base = (string) config('services.coderoot.status_url', 'https://coderootsolutions.com/api/v1/site-status/');

        try {
            $res = Http::timeout(self::TIMEOUT_SECONDS)
                ->withOptions(['connect_timeout' => self::TIMEOUT_SECONDS])
                ->acceptJson()
                ->get(rtrim($base, '/').'/'.rawurlencode($key));
        } catch (Throwable $e) {
            return null;
        }

        if (! $res->successful()) {
            return null;
        }

        $data = $res->json();
        if (! is_array($data)) {
            return null;
        }

        $status = $data['status'] ?? null;
        $timestamp = $data['timestamp'] ?? null;
        $signature = $data['signature'] ?? null;

        if (! in_array($status, ['active', 'blocked'], true)
            || ! is_numeric($timestamp)
            || ! is_string($signature)) {
            return null;
        }

        $timestamp = (int) $timestamp;
        if (abs(time() - $timestamp) > self::MAX_CLOCK_SKEW) {
            return null;
        }

        $expected = hash_hmac('sha256', $key.'|'.$status.'|'.$timestamp, $secret);
        if (! hash_equals($expected, strtolower($signature))) {
            return null;
        }

        $cacheSeconds = (int) ($data['cache_seconds'] ?? self::CACHE_SECONDS);

        return [
            'status' => $status,
            'message' => is_string($data['message'] ?? null) ? $data['message'] : '',
            'contact' => is_array($data['contact'] ?? null) ? $data['contact'] : [],
            'cache_seconds' => max(60, min($cacheSeconds, 3600)),
        ];
    }

    private function blockedResponse(Request $request, array $state)
    {
        $headers = [
            'Retry-After' => '3600',
            'Cache-Control' => 'no-store',
            // Lets the React app recognise this page and show it in place.
            'X-CodeRoot-Guard' => 'blocked',
        ];

        $html = $this->page($state);

        if ($request->expectsJson()) {
            return response()->json([
                'message' => 'Website temporarily unavailable.',
                'site_blocked' => true,
                'page' => $html,
            ], 503, $headers);
        }

        return response($html, 503, $headers + ['Content-Type' => 'text/html; charset=utf-8']);
    }

    private function page(array $state): string
    {
        $e = fn ($v) => htmlspecialchars((string) $v, ENT_QUOTES, 'UTF-8');

        $message = trim($state['message'] ?? '');
        if ($message === '') {
            $message = 'This website is temporarily unavailable. Please check back soon.';
        }
        $paragraphs = '';
        foreach (preg_split('/\n\s*\n/', $message) as $p) {
            $paragraphs .= '<p>'.nl2br($e(trim($p))).'</p>';
        }

        $c = $state['contact'] ?? [];
        $contact = '';
        if (! empty($c['name'])) {
            $contact .= '<strong>'.$e($c['name']).'</strong>';
        }
        if (! empty($c['phone'])) {
            $tel = preg_replace('/[^0-9+]/', '', (string) $c['phone']);
            $contact .= '<a href="tel:'.$e($tel).'">'.$e($c['phone']).'</a>';
        }
        if (! empty($c['email'])) {
            $contact .= '<a href="mailto:'.$e($c['email']).'">'.$e($c['email']).'</a>';
        }
        if ($contact !== '') {
            $contact = '<div class="contact">'.$contact.'</div>';
        }

        return <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Website temporarily unavailable</title>
<style>
  :root { color-scheme: light dark; --bg:#f5f6f8; --card:#fff; --text:#1d2430; --muted:#5b6575; --line:#e2e5ea; --accent:#2f6fed; }
  @media (prefers-color-scheme: dark) { :root { --bg:#12151b; --card:#1b2029; --text:#e8ebf0; --muted:#9aa3b2; --line:#2a303b; --accent:#7aa5ff; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px 16px;
         background:var(--bg); color:var(--text); font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  main { max-width:560px; width:100%; background:var(--card); border:1px solid var(--line); border-radius:14px; padding:32px 28px; }
  h1 { font-size:1.35rem; margin:0 0 16px; }
  p { margin:0 0 12px; color:var(--muted); }
  .contact { margin-top:20px; padding-top:16px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:4px; }
  a { color:var(--accent); text-decoration:none; }
</style>
</head>
<body>
<main>
  <h1>Website temporarily unavailable</h1>
  {$paragraphs}
  {$contact}
</main>
</body>
</html>
HTML;
    }
}
