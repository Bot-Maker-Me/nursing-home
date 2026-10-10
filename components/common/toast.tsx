'use client'

import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { CheckCircle2, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tone = 'success' | 'error'
type Toast = { id: number; message: string; tone: Tone }
type ToastApi = { success: (message: string) => void; error: (message: string) => void }

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback(
    (message: string, tone: Tone) => {
      const id = Date.now() + Math.random()
      setToasts((current) => [...current, { id, message, tone }])
      setTimeout(() => remove(id), 5000)
    },
    [remove],
  )

  const api = useMemo<ToastApi>(
    () => ({ success: (message) => push(message, 'success'), error: (message) => push(message, 'error') }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:items-end sm:px-6"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 border px-4 py-3 text-sm shadow-[8px_8px_0_0_rgba(0,0,0,0.12)]',
              toast.tone === 'success'
                ? 'border-forest/30 bg-mint text-forest'
                : 'border-terracotta/40 bg-[#fbeee6] text-terracotta',
            )}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            )}
            <span className="flex-1">{toast.message}</span>
            <button type="button" onClick={() => remove(toast.id)} aria-label="Dismiss" className="hover:opacity-70">
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within a ToastProvider')
  return context
}
