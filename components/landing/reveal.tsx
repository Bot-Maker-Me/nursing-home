'use client'

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, ElementType, HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Scroll-driven entrance animations for the marketing page. Everything is driven
 * by CSS in `app/globals.css` (scoped to `[data-site-theme='pharma']`); these
 * components only flip a `data-visible` attribute once the element scrolls into
 * view, or immediately for anything already on screen at load (so the hero
 * animates in on first paint). Reduced-motion is handled in CSS.
 */
function useInView() {
  const [inView, setInView] = useState(false)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const setNode = useCallback((node: HTMLElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    if (!node) return

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            observer.disconnect()
            observerRef.current = null
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(node)
    observerRef.current = observer
  }, [])

  useEffect(() => () => observerRef.current?.disconnect(), [])

  return { setNode, inView }
}

type RevealProps = {
  as?: ElementType
  className?: string
  children: ReactNode
  /** Delay before the animation begins, in milliseconds. */
  delay?: number
  /** `rise` (default) fades + lifts with a soft blur; `fade` only fades. */
  variant?: 'rise' | 'fade'
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'style'>

export function Reveal({ as = 'div', className, children, delay = 0, variant = 'rise', ...rest }: RevealProps) {
  const { setNode, inView } = useInView()
  const Tag = as as 'div'

  return (
    <Tag
      ref={setNode}
      data-visible={inView ? '' : undefined}
      className={cn(variant === 'fade' ? 'reveal-fade' : 'reveal', className)}
      style={{ '--reveal-delay': `${delay}ms` } as CSSProperties}
      {...rest}
    >
      {children}
    </Tag>
  )
}

type RevealTextProps = {
  as?: ElementType
  text: string
  className?: string
  /** Delay before the first word begins, in milliseconds. */
  delay?: number
  /** Stagger between consecutive words, in milliseconds. */
  stagger?: number
  /** `rise` climbs up into place; `drop` falls down into place. */
  variant?: 'rise' | 'drop'
} & Omit<HTMLAttributes<HTMLElement>, 'className' | 'children' | 'style'>

export function RevealText({
  as = 'p',
  text,
  className,
  delay = 0,
  stagger = 55,
  variant = 'rise',
  ...rest
}: RevealTextProps) {
  const { setNode, inView } = useInView()
  const Tag = as as 'p'
  const words = text.split(/\s+/).filter(Boolean)

  return (
    <Tag
      ref={setNode}
      data-reveal-text=""
      data-reveal-variant={variant}
      data-visible={inView ? '' : undefined}
      className={className}
      style={{ '--reveal-delay': `${delay}ms`, '--reveal-stagger': `${stagger}ms` } as CSSProperties}
      {...rest}
    >
      {words.map((word, index) => (
        <Fragment key={`${word}-${index}`}>
          <span className="reveal-word" style={{ '--word-index': index } as CSSProperties}>
            <span>{word}</span>
          </span>
          {index < words.length - 1 ? ' ' : null}
        </Fragment>
      ))}
    </Tag>
  )
}
