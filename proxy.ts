import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/proxy'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

// The session refresh belongs to pages, not to artwork. `/apple-icon` and
// `/notification-badge` are the push notification's icon and badge, and they are the only
// images here without a file extension — so they were the only ones running the Supabase
// round trip first, while the favicon (`/icon.svg`) was already served straight from the
// static output. A notification icon that arrives late, or as HTML, is drawn as no icon at
// all, so these two are excluded exactly like `_next/static` and the image extensions.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|apple-icon|notification-badge|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
