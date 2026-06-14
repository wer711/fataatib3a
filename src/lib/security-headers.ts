/**
 * Security Headers Configuration
 *
 * These headers are applied to API responses only (not to the main page).
 * We avoid setting X-Frame-Options or frame-ancestors restrictions
 * so the preview panel can render the page in an iframe.
 */

import { NextResponse } from "next/server";

/**
 * Security headers applied to API route responses only.
 * NOTE: Frame-related headers (X-Frame-Options, frame-ancestors) are
 * intentionally omitted to allow the page to be embedded in preview iframes.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

/**
 * Apply security headers to a NextResponse object.
 */
export function applySecurityHeaders<T extends NextResponse>(response: T): T {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
