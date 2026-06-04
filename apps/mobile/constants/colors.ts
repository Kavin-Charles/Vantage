// apps/mobile/constants/colors.ts
// Vencore design tokens — synced from colors_and_type.css
export const Colors = {
  // Surfaces
  bg:       '#f7f6f2',
  surface:  '#ffffff',
  surface2: '#f0ede6',
  border:   '#e4e0d8',
  border2:  '#d5d0c8',

  // Text (updated to match design system exactly)
  text:  '#0b1330',
  text2: '#4a5677',
  text3: '#8e96ac',

  // Semantic
  green:    '#2d6a4f',
  greenBg:  '#d8f3dc',
  amber:    '#92400e',
  amberBg:  '#fef3c7',
  red:      '#991b1b',
  redBg:    '#fee2e2',
  blue:     '#1e3a8a',
  blueBg:   '#dbeafe',
  purple:   '#4c1d95',
  purpleBg: '#ede9fe',
  gray:     '#374151',
  grayBg:   '#f3f4f6',
} as const;

export type ColorKey = keyof typeof Colors;

/** Maps a badge color string (from design) to a Colors key pair */
export const BadgeColors: Record<string, { fg: string; bg: string }> = {
  green:  { fg: Colors.green,  bg: Colors.greenBg  },
  amber:  { fg: Colors.amber,  bg: Colors.amberBg  },
  red:    { fg: Colors.red,    bg: Colors.redBg    },
  blue:   { fg: Colors.blue,   bg: Colors.blueBg   },
  purple: { fg: Colors.purple, bg: Colors.purpleBg },
  gray:   { fg: Colors.gray,   bg: Colors.grayBg   },
};
