const paths = {
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cart: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 2-1.6L21 8H6" /><circle cx="10" cy="20" r="1.3" /><circle cx="18" cy="20" r="1.3" /></>,
  user: <><circle cx="12" cy="8" r="3.6" /><path d="M4.5 20a7.5 7.5 0 0 1 15 0" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  star: <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.7l5.9-.8z" />,
  truck: <><path d="M2 6h11v10H2z" /><path d="M13 9h4l4 3.5V16h-8" /><circle cx="6" cy="18" r="1.6" /><circle cx="17" cy="18" r="1.6" /></>,
  shield: <path d="M12 3l7 3v6c0 4.2-2.9 7.5-7 9-4.1-1.5-7-4.8-7-9V6z" />,
  return: <><path d="M3 10a8 8 0 1 1 2.4 5.7" /><path d="M3 4v6h6" /></>,
  pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  check: <path d="m4 12.5 5 5L20 6.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  heart: <path d="M12 20s-7-4.4-7-9.2A4 4 0 0 1 12 8a4 4 0 0 1 7 2.8C19 15.6 12 20 12 20z" />,
  bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  trending: <><path d="m3 17 6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  package: <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="m3 7.5 9 4.5 9-4.5M12 12v9" /></>,
  credit: <><rect x="2" y="5" width="20" height="14" rx="2.5" /><path d="M2 10h20" /></>,
  box: <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="m3 7.5 9 4.5 9-4.5" /></>,
  stroller: <><path d="M4 5h3l2.2 8.4A2.5 2.5 0 0 0 11.6 15h6.2" /><path d="M20 8a6 6 0 0 0-6-6v7h6z" /><circle cx="8" cy="19" r="1.7" /><circle cx="17" cy="19" r="1.7" /></>,
  sparkle: <><path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
  phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.6" /><path d="M10.5 18.5h3" /></>,
  home: <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></>,
  basket: <><path d="M3 9h18l-1.6 10a2 2 0 0 1-2 1.7H6.6a2 2 0 0 1-2-1.7z" /><path d="m8 9 3-5M16 9l-3-5" /><path d="M9.5 13v4M14.5 13v4" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
  shirt: <path d="M8 3 4 5.5 6 10l2-1v11h8V9l2 1 2-4.5L16 3l-2 2h-4z" />,
  wrench: <path d="M15 3a5 5 0 0 0-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 1 0 15 3z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  tag: <><path d="M11.5 3H20a1 1 0 0 1 1 1v8.5L11 22.5 1.5 13z" /><circle cx="16.5" cy="7.5" r="1.3" /></>,
  users: <><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M17.5 20a6.6 6.6 0 0 0-2-4.7" /></>,
  building: <><rect x="4" y="3" width="16" height="18" rx="1.5" /><path d="M8 7h2M14 7h2M8 11h2M14 11h2M8 15h2M14 15h2" /></>,
  chart: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5M12.5 16V7M17 16v-8" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 4a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z" /></>,
}

export function Icon({ name, size = 18, strokeWidth = 1.8, fill = 'none', style }) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill={fill}
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      style={style} aria-hidden="true"
    >
      {paths[name] || paths.box}
    </svg>
  )
}

export const categoryHue = {
  'baby-mother': 205,
  'hair-beauty': 330,
  'phones-tech': 222,
  'home-kitchen': 18,
  'groceries': 108,
  'solar-power': 42,
  'fashion': 288,
  'diy-auto': 8,
}
