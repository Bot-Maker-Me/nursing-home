import { ImageResponse } from 'next/og'

/**
 * The small status-bar icon Android renders beside a web push notification.
 *
 * Android masks this image to a silhouette and tints it, so it has to be the app's own
 * glyph on a transparent background — not a screenshot of the app icon and never a vendor
 * logo. The plus is the same mark the portal uses everywhere else (see app/icon.svg,
 * app/apple-icon.tsx and components/brand/logo.tsx).
 *
 * The badge is served from here rather than from `public/` because the artwork is drawn in
 * code, so it can never drift from the rest of the brand.
 */
const SIZE = { width: 96, height: 96 }
const BAR = { long: 60, thick: 12 }

/**
 * Prerendered at build time, exactly like `app/apple-icon.tsx`. A notification's artwork
 * must never depend on something being generated while the alert is being displayed: the
 * badge is fetched in the middle of a push event, so it is a static file in the build output
 * rather than a function that has to render an image on demand.
 */
export const dynamic = 'force-static'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: BAR.thick,
            height: BAR.long,
            background: '#ffffff',
            borderRadius: 3,
          }}
        />
        <div
          style={{
            position: 'absolute',
            width: BAR.long,
            height: BAR.thick,
            background: '#ffffff',
            borderRadius: 3,
          }}
        />
      </div>
    ),
    SIZE,
  )
}
