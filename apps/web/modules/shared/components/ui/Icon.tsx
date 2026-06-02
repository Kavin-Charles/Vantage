import React from 'react';

const ICONS: Record<string, React.ReactNode> = {
  pipeline: <>
    <rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/>
    <rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/>
    <path d="M9 6h6M9 18h6M6 9v6M18 9v6"/>
  </>,
  contacts: <><circle cx="12" cy="8" r="3.5"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></>,
  companies: <>
    <path d="M4 21V6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v15"/>
    <path d="M12 9h7a1 1 0 0 1 1 1v11"/>
    <path d="M3 21h18"/>
    <path d="M7 9h.01M7 13h.01M7 17h.01M16 13h.01M16 17h.01"/>
  </>,
  tasks: <>
    <path d="M9 6h12M9 12h12M9 18h12"/>
    <path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/>
  </>,
  activity: <path d="M3 12h3l3-7 4 14 3-7h5"/>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></>,
  servers: <>
    <rect x="3" y="4" width="18" height="6" rx="1.5"/>
    <rect x="3" y="14" width="18" height="6" rx="1.5"/>
    <circle cx="7" cy="7" r=".75" fill="currentColor"/><circle cx="7" cy="17" r=".75" fill="currentColor"/>
    <path d="M11 7h6M11 17h6"/>
  </>,
  databases: <>
    <ellipse cx="12" cy="5.5" rx="8" ry="2.5"/>
    <path d="M4 5.5v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/>
    <path d="M4 11.5v7c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-7"/>
  </>,
  websites: <>
    <circle cx="12" cy="12" r="9"/>
    <path d="M3 12h18"/>
    <path d="M12 3a13.5 13.5 0 0 1 0 18"/>
    <path d="M12 3a13.5 13.5 0 0 0 0 18"/>
  </>,
  files: <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/>
  </>,
  analytics: <>
    <path d="M4 20V4"/><path d="M4 20h16"/>
    <rect x="7" y="12" width="3.2" height="6" rx=".5"/>
    <rect x="12" y="8" width="3.2" height="10" rx=".5"/>
    <rect x="17" y="4" width="3.2" height="14" rx=".5"/>
  </>,
  alerts: <><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18v.5"/></>,
  settings: <>
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>
  </>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></>,
  bell: <><path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9Z"/><path d="M10.5 21a1.7 1.7 0 0 0 3 0"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
  chevron: <path d="m6 9 6 6 6-6"/>,
  'chevron-up': <path d="m18 15-6-6-6 6"/>,
  arrow: <><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></>,
  check: <path d="m5 12 5 5 9-11"/>,
  x: <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>,
  warning: <><path d="M12 3 2 21h20Z"/><path d="M12 10v5M12 18v.5"/></>,
  logout: <><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/></>,
  phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .3 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7A2 2 0 0 1 22 16.9z"/>,
  meeting: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4M16 3v4"/></>,
  note: <>
    <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
    <path d="M14 3v6h6"/><path d="M8 13h8M8 17h6"/>
  </>,
  filter: <><path d="M22 3H2l8 9.46V19l4 2V12.46L22 3z"/></>,
  grip: <><circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></>,
  deployments: <><path d="M12 3l1.8 5.4H20l-4.9 3.5 1.8 5.5L12 14l-4.9 3.4 1.8-5.5L4 8.4h6.2Z"/></>,
  plugin: <><rect x="7" y="3" width="10" height="5" rx="1.5"/><path d="M7 8v13h10V8"/><path d="M3 12h4M17 12h4"/></>,
};

export function Icon({
  name,
  size = 18,
  color,
  strokeWidth = 1.75,
  style,
}: {
  name: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: React.CSSProperties;
}) {
  const content = ICONS[name];
  if (!content) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {content}
    </svg>
  );
}
