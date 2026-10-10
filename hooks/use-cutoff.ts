'use client'

import { useEffect, useState } from 'react'

const TIME_ZONE = 'America/Toronto'

function minutesNowInZone() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date())
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  return get('hour') * 3600 + get('minute') * 60 + get('second')
}

export type CutoffState = {
  ready: boolean
  passed: boolean
  hours: number
  minutes: number
  seconds: number
  label: string
}

export function useCutoff(cutoff = '17:00'): CutoffState {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    setNow(minutesNowInZone())
    const id = setInterval(() => setNow(minutesNowInZone()), 1000)
    return () => clearInterval(id)
  }, [])

  if (now === null) {
    return { ready: false, passed: false, hours: 0, minutes: 0, seconds: 0, label: '—' }
  }

  const [h, m] = cutoff.split(':').map(Number)
  const diff = h * 3600 + m * 60 - now
  if (diff <= 0) {
    return { ready: true, passed: true, hours: 0, minutes: 0, seconds: 0, label: 'Cut-off passed' }
  }
  const hours = Math.floor(diff / 3600)
  const minutes = Math.floor((diff % 3600) / 60)
  const seconds = diff % 60
  return {
    ready: true,
    passed: false,
    hours,
    minutes,
    seconds,
    label: `Cut-off in ${hours}h ${String(minutes).padStart(2, '0')}m`,
  }
}
