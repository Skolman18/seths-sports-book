import { useState } from 'react'
import { initialsFor } from './data'

interface LogoProps {
  src: string | null
  label: string
  size?: number
  /** background used behind the fallback initials badge */
  fallbackBg?: string
  fallbackColor?: string
  className?: string
}

/** School/team logo chip. Falls back to an initials badge if the logo
 *  fails to load (e.g. no ESPN logo for that school, or offline). */
export function Logo({
  src,
  label,
  size = 36,
  fallbackBg = '#e8e0d0',
  fallbackColor = '#1a1a1a',
  className = '',
}: LogoProps) {
  const [failed, setFailed] = useState(false)
  const style: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    flexShrink: 0,
  }
  if (!src || failed) {
    return (
      <span
        className={`logo-fallback ${className}`}
        style={{
          ...style,
          background: fallbackBg,
          color: fallbackColor,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: Math.max(10, Math.round(size * 0.32)),
          border: '1px solid rgba(0,0,0,0.15)',
        }}
        title={label}
        aria-label={label}
      >
        {initialsFor(label)}
      </span>
    )
  }
  return (
    <img
      src={src}
      alt={`${label} logo`}
      className={`logo-img ${className}`}
      style={{ ...style, objectFit: 'contain', background: '#fff' }}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
