'use client';

import { eventColor, type CalendarEvent } from '@/lib/calendar';

interface EventChipProps {
  event: CalendarEvent;
  onClick: (e: React.MouseEvent) => void;
}

export function EventChip({ event, onClick }: EventChipProps) {
  const color = eventColor(event);
  return (
    <span
      onClick={onClick}
      title={event.title}
      style={{
        display: 'block',
        background: color + '20',
        color,
        border: `1px solid ${color}40`,
        borderRadius: 4,
        padding: '1px 6px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
        marginBottom: 2,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {event.title}
    </span>
  );
}
