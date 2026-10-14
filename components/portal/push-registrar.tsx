'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '@/lib/push'

/**
 * Registers the push service worker as soon as the portal loads (and re-uses the existing
 * registration on later visits). It requests no permission and shows nothing.
 */
export function PushRegistrar() {
  useEffect(() => {
    void registerServiceWorker()
  }, [])
  return null
}
