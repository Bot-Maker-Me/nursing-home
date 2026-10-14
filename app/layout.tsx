import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Fraunces, IBM_Plex_Mono, Inter, JetBrains_Mono, Manrope } from 'next/font/google'
import { ToastProvider } from '@/components/common/toast'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

// Loaded as variables only — these are applied by the marketing scope
// ([data-site-theme='pharma']), never to the portal or the consoles.
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' })
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-plex-mono' })

export const metadata: Metadata = {
  title: "Henderson's Pharmacy — Client Portal",
  description:
    "The secure portal for long-term care homes served by Henderson's Pharmacy: messaging, delivery tracking, order cut-offs, policies, and emergency contacts.",
  robots: { index: false, follow: false },
  // Required for Web Push: iOS only delivers notifications to an installed (Home Screen)
  // app, which is what this manifest turns the portal into.
  manifest: '/manifest.json',
  appleWebApp: { capable: true, title: "Henderson's Portal", statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#17392f',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable} ${manrope.variable} ${fraunces.variable} ${plexMono.variable} bg-background`}
    >
      <body className="antialiased">
        <ToastProvider>{children}</ToastProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
