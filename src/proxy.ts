import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// Next 16 renamed the `middleware` file convention to `proxy`. The handler
// itself is unchanged — next-intl still ships it as `next-intl/middleware`.
export default createMiddleware(routing);

export const config = {
  // Everything except /api, Next internals, and files with an extension.
  // API route handlers are locale-agnostic; they take locale as an explicit argument.
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
