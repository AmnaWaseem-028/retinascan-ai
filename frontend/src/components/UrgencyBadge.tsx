import React from 'react'
import { type UrgencyTier, URGENCY_CONFIGS } from '../types/triage'

interface UrgencyBadgeProps {
  tier: UrgencyTier | string | null | undefined
  priority?: number | null
  showIcon?: boolean
  showPriority?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export const UrgencyBadge: React.FC<UrgencyBadgeProps> = ({
  tier,
  priority,
  showIcon = true,
  showPriority = true,
  size = 'md',
  className = '',
}) => {
  const normalizedTier = (tier as UrgencyTier) || 'ROUTINE'
  const config = URGENCY_CONFIGS[normalizedTier] || URGENCY_CONFIGS.ROUTINE

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3.5 py-1.5 gap-2 font-semibold',
  }

  // Only true emergencies (Grade 4) pulse. Quality Recall just means "recapture the image".
  const isEmergent = normalizedTier === 'EMERGENT'

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border shadow-xs whitespace-nowrap transition-all ${config.badgeBg} ${config.badgeText} ${config.badgeBorder} ${sizeClasses[size]} ${className}`}
      title={`${config.label} (${config.priorityLabel}) - ${config.timeframe}`}
    >
      {showIcon && (
        <span className="relative flex items-center justify-center">
          {isEmergent && (
            <span
              className={`absolute inline-flex h-2.5 w-2.5 rounded-full ${config.dotColor} opacity-75 animate-ping`}
            />
          )}
          <i className={`ti ${config.icon} shrink-0`}></i>
        </span>
      )}

      <span>{config.label}</span>

      {showPriority && (
        <span
          className={`ml-0.5 px-1 py-0.2 rounded text-[10px] uppercase font-bold tracking-wider bg-black/10`}
        >
          {priority ? `P${priority}` : `P${config.level}`}
        </span>
      )}
    </span>
  )
}

export default UrgencyBadge