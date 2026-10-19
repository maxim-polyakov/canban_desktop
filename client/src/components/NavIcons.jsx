import React from 'react';

// Outline 16px icons in the style of Jira's navigation (1.5px strokes, rounded joins).
const PATHS = {
  sidebar: <><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" /><path d="M6 2.75v10.5M3.5 5.5h.5M3.5 7.5h.5" /></>,
  apps: <><rect x="2" y="2" width="4.5" height="4.5" rx="1" /><rect x="9.5" y="2" width="4.5" height="4.5" rx="1" /><rect x="2" y="9.5" width="4.5" height="4.5" rx="1" /><rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1" /></>,
  appsAdd: <><rect x="2" y="2" width="4.5" height="4.5" rx="1" /><rect x="9.5" y="2" width="4.5" height="4.5" rx="1" /><rect x="2" y="9.5" width="4.5" height="4.5" rx="1" /><path d="M11.75 9.5v4.5M9.5 11.75H14" /></>,
  forYou: <><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="6.5" r="2" /><path d="M4.4 12.6c.8-1.5 2-2.3 3.6-2.3s2.8.8 3.6 2.3" /></>,
  recent: <><circle cx="8" cy="8" r="6.25" /><path d="M8 4.75V8l2.25 1.5" /></>,
  star: <path d="m8 1.9 1.85 3.85 4.2.55-3.07 2.92.77 4.17L8 11.37l-3.75 2.02.77-4.17L1.95 6.3l4.2-.55z" />,
  plans: <><rect x="1.75" y="2.75" width="8" height="3" rx="1" /><rect x="6.25" y="10.25" width="8" height="3" rx="1" /><path d="M4 5.75V8.5h7.5v1.75" /></>,
  spaces: <><circle cx="8" cy="8" r="4" /><path d="M2.1 11.6c-.9-1.6 1.6-4.3 5.6-6.1 4-1.8 7.4-2 8.2-.4" /></>,
  filters: <path d="M2 4h12M4.25 8h7.5M6.5 12h3" />,
  dashboards: <><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" /><path d="M1.75 6.5h12.5M7 6.5v7.75" /></>,
  teams: <><circle cx="5.5" cy="5.25" r="2" /><circle cx="11" cy="5.75" r="1.6" /><path d="M1.75 13c.4-2.2 1.8-3.5 3.75-3.5S8.85 10.8 9.25 13M10 9.6c.3-.1.6-.1 1-.1 1.6 0 2.8 1.1 3.25 3.5" /></>,
  goals: <><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="8" r="2.5" /></>,
  projects: <><path d="M9.5 2.25c2.6.2 4.1 1.7 4.25 4.25L8.5 11.75 4.25 7.5z" /><path d="M5.6 8.9 3 9.4l-1 1.6 2.6.4M7.1 10.4l-.5 2.6-1.6 1-.4-2.6" /><circle cx="10.25" cy="5.75" r="1" /></>,
  customize: <><path d="M2 4.5h7M12 4.5h2M2 11.5h2M7 11.5h7" /><circle cx="10.5" cy="4.5" r="1.5" /><circle cx="5.5" cy="11.5" r="1.5" /></>,
  search: <><circle cx="7" cy="7" r="4.75" /><path d="m10.5 10.5 3.5 3.5" /></>,
  plus: <path d="M8 2.5v11M2.5 8h11" />,
  bell: <><path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1.25 1.25H2.75z" /><path d="M6.5 14.25h3" /></>,
  help: <><circle cx="8" cy="8" r="6.25" /><path d="M6.2 6.2A1.9 1.9 0 0 1 8 4.9c1.05 0 1.9.75 1.9 1.7 0 1.4-1.9 1.5-1.9 2.9" /><path d="M8 11.4v.1" /></>,
  settings: <><circle cx="8" cy="8" r="2" /><path d="M8 1.75v1.6M8 12.65v1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M1.75 8h1.6M12.65 8h1.6M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" /><circle cx="8" cy="8" r="4.6" /></>,
  chevronRight: <path d="m6 3.5 4.5 4.5L6 12.5" />,
  chevronDown: <path d="m3.5 6 4.5 4.5L12.5 6" />,
  more: <><circle cx="3.5" cy="8" r=".6" /><circle cx="8" cy="8" r=".6" /><circle cx="12.5" cy="8" r=".6" /></>,
  external: <><path d="M9.5 2.25h4.25V6.5M13.5 2.5 7.5 8.5" /><path d="M11.75 9.5v3a1.25 1.25 0 0 1-1.25 1.25h-7a1.25 1.25 0 0 1-1.25-1.25v-7A1.25 1.25 0 0 1 3.5 4.25h3" /></>,
  close: <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />,
  person: <><circle cx="8" cy="5.25" r="2.75" /><path d="M2.75 14c.5-2.75 2.5-4.25 5.25-4.25S12.75 11.25 13.25 14" /></>,
  switchAccount: <><circle cx="6" cy="5" r="2.25" /><path d="M1.75 13c.4-2.3 1.9-3.5 4.25-3.5 1 0 1.8.2 2.5.6M11.5 9v5M9 11.5h5" /></>,
  logout: <><path d="M6.5 2.25H3.5a1.25 1.25 0 0 0-1.25 1.25v9a1.25 1.25 0 0 0 1.25 1.25h3" /><path d="M10.5 5 13.5 8l-3 3M13.25 8H6" /></>,
  theme: <><circle cx="8" cy="8" r="6.25" /><path d="M8 1.75v12.5a6.25 6.25 0 0 0 0-12.5z" fill="currentColor" /></>,
  globe: <><circle cx="8" cy="8" r="6.25" /><path d="M1.75 8h12.5M8 1.75c1.8 1.7 2.6 3.8 2.6 6.25S9.8 12.55 8 14.25C6.2 12.55 5.4 10.45 5.4 8S6.2 3.45 8 1.75z" /></>,
  monitor: <><rect x="1.75" y="2.25" width="12.5" height="8.5" rx="1.5" /><path d="M5.5 13.75h5M8 10.75v3" /></>,
  issues: <><rect x="1.75" y="3.75" width="10.5" height="10.5" rx="2" /><path d="M4.5 1.75h8.25a1.5 1.5 0 0 1 1.5 1.5v8.25M4.75 9l1.75 1.75 3-3.25" /></>,
  user: <><circle cx="8" cy="5.5" r="2.5" /><path d="M3.25 13.5c.45-2.4 2.2-3.75 4.75-3.75s4.3 1.35 4.75 3.75" /></>,
  card: <><rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.5" /><path d="M1.75 6.5h12.5M4 10h2.5" /></>,
  bulb: <><path d="M5.6 10.9C4.3 9.9 3.6 8.6 3.6 7.2a4.4 4.4 0 0 1 8.8 0c0 1.4-.7 2.7-2 3.7v1.35H5.6z" /><path d="M6.25 14.25h3.5" /></>,
  docs: <><path d="M4.25 1.75h5l3.5 3.5v8a1 1 0 0 1-1 1h-7.5a1 1 0 0 1-1-1v-10.5a1 1 0 0 1 1-1z" /><path d="M9 1.75v3.5h3.75M5.75 8.5h4.5M5.75 11h4.5" /></>,
  chat: <><path d="M2.25 3.25a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.75a1 1 0 0 1-1-1z" /><path d="M5 5.5h6M5 8h4" /></>,
  keyboard: <><rect x="1.25" y="3.75" width="13.5" height="8.5" rx="1.5" /><path d="M4 6.5h.5M6.75 6.5h.5M9.5 6.5h.5M12 6.5h0M4.75 9.5h6.5" /></>,
  feedback: <><path d="M2.25 3.25a1 1 0 0 1 1-1h9.5a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7l-3 2.5v-2.5h-.75a1 1 0 0 1-1-1z" /><path d="m6.5 5 2 2-2 2" /></>,
  board: <><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" /><path d="M6 1.75v12.5M10 1.75v8" /></>,
  backlog: <path d="M2 3.5h12M2 8h12M2 12.5h7" />,
  timeline: <path d="M2 3.5h6M5 8h7M8 12.5h6" />,
  reports: <path d="M2.25 13.75h11.5M4.25 11V7.5M8 11V3.5M11.75 11V6" />,
  releases: <><path d="M2.25 9.25 8 2.25l5.75 7-5.75 4.5z" /><path d="M8 2.25v11.5" /></>,
  components: <><path d="M6 2.25h4V5a1.5 1.5 0 1 0 0 3v2.75H7.25a1.5 1.5 0 1 1-3 0H2.25V6.5H5a1.5 1.5 0 1 0 0-3z" transform="translate(1.25 1.25)" /></>,
  archive: <><rect x="1.75" y="2.25" width="12.5" height="3.25" rx="1" /><path d="M2.75 5.5v7.25a1 1 0 0 0 1 1h8.5a1 1 0 0 0 1-1V5.5M6.25 8.5h3.5" /></>,
  workflow: <><rect x="1.75" y="2" width="4" height="4" rx="1" /><rect x="10.25" y="10" width="4" height="4" rx="1" /><path d="M5.75 4h3.5a2 2 0 0 1 2 2v4" /></>,
  lock: <><rect x="2.75" y="7" width="10.5" height="7.25" rx="1.5" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></>,
  automation: <path d="M9.25 1.75 3.5 9h4l-.75 5.25L12.5 7h-4z" />,
  integrations: <><path d="M5.5 2.25v3M10.5 2.25v3M3.75 5.25h8.5V8a4.25 4.25 0 0 1-8.5 0zM8 12.25v2" /></>,
  operations: <><path d="M2.75 5.25 5.5 2.5l2.75 2.75M5.5 2.75v8.5M13.25 10.75 10.5 13.5l-2.75-2.75M10.5 13.25v-8.5" /></>,
  check: <path d="m3 8.5 3 3 7-7" />,
  assets: <><path d="M8 1.75 13.75 5v6L8 14.25 2.25 11V5z" /><path d="M2.25 5 8 8.25 13.75 5M8 8.25v6" /></>,
  template: <><rect x="1.75" y="1.75" width="12.5" height="12.5" rx="2" /><path d="M1.75 6h12.5M6 6v8.25" /><path d="M9 9.5h2.75M9 12h2.75" /></>,
  billing: <><rect x="2.75" y="1.75" width="10.5" height="12.5" rx="1.5" /><path d="M5.5 5h5M5.5 8h5M5.5 11h2.5" /></>,
  eye: <><path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" /><circle cx="8" cy="8" r="2" /></>,
  eyeOff: <><path d="M6.2 3.75A6.6 6.6 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.6 2.2M10.6 11.9A6.4 6.4 0 0 1 8 12.5C3.9 12.5 1.5 8 1.5 8a11 11 0 0 1 2.6-3.1" /><path d="m2 2 12 12M6.6 6.6a2 2 0 0 0 2.8 2.8" /></>,
  drag: <><circle cx="6" cy="4" r=".6" /><circle cx="10" cy="4" r=".6" /><circle cx="6" cy="8" r=".6" /><circle cx="10" cy="8" r=".6" /><circle cx="6" cy="12" r=".6" /><circle cx="10" cy="12" r=".6" /></>,
  system: <><rect x="1.75" y="2.25" width="12.5" height="5" rx="1" /><rect x="1.75" y="8.75" width="12.5" height="5" rx="1" /><path d="M4.25 4.75h.5M4.25 11.25h.5" /></>,
  overview: <><path d="M2.25 13.75V8.5M6 13.75V4.5M9.75 13.75V7M13.5 13.75V2.25" /></>,
  sparkle: <path d="M8 1.75c.4 3.2 1.9 4.85 5.25 5.25-3.35.4-4.85 2.05-5.25 5.25C7.6 9.05 6.1 7.4 2.75 7 6.1 6.6 7.6 4.95 8 1.75zM12.5 11.5c.15.9.6 1.35 1.5 1.5-.9.15-1.35.6-1.5 1.5-.15-.9-.6-1.35-1.5-1.5.9-.15 1.35-.6 1.5-1.5z" />,
  sun: <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" /></>,
  moon: <path d="M13.25 9.6A5.6 5.6 0 0 1 6.4 2.75a5.6 5.6 0 1 0 6.85 6.85z" />,
  box: <><path d="M2.25 4.75 8 2l5.75 2.75v6.5L8 14l-5.75-2.75z" /><path d="M2.25 4.75 8 7.5l5.75-2.75M8 7.5V14" /></>,
  laptop: <><rect x="3" y="3" width="10" height="7" rx="1" /><path d="M1.5 12.75h13" /></>,
  server: <><rect x="2.25" y="2" width="11.5" height="5" rx="1" /><rect x="2.25" y="9" width="11.5" height="5" rx="1" /><path d="M4.75 4.5h.5M4.75 11.5h.5M8 4.5h3M8 11.5h3" /></>,
  phone: <><rect x="4.25" y="1.75" width="7.5" height="12.5" rx="1.5" /><path d="M7.25 11.75h1.5" /></>,
  license: <><rect x="1.75" y="3" width="12.5" height="10" rx="1.5" /><circle cx="5.5" cy="7.25" r="1.5" /><path d="M3.5 11c.4-1 1.1-1.5 2-1.5s1.6.5 2 1.5M9.25 6.5h3M9.25 9h2" /></>,
  software: <><rect x="1.75" y="2.25" width="12.5" height="11.5" rx="1.5" /><path d="M1.75 5.25h12.5M6 8l-1.5 1.5L6 11M10 8l1.5 1.5L10 11" /></>,
  location: <><path d="M8 14.25s4.75-4.2 4.75-7.75a4.75 4.75 0 0 0-9.5 0c0 3.55 4.75 7.75 4.75 7.75z" /><circle cx="8" cy="6.5" r="1.75" /></>,
  service: <><circle cx="8" cy="8" r="2" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2" /><circle cx="8" cy="8" r="5" /></>,
  network: <><circle cx="8" cy="3" r="1.5" /><circle cx="3" cy="12.5" r="1.5" /><circle cx="13" cy="12.5" r="1.5" /><path d="M7.2 4.3 3.8 11.2M8.8 4.3l3.4 6.9M4.5 12.5h7" /></>,
  folder: <path d="M1.75 4a1 1 0 0 1 1-1h3.5l1.5 1.75h5.5a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1z" />,
  graph: <><circle cx="3.5" cy="8" r="1.75" /><circle cx="12.5" cy="3.5" r="1.75" /><circle cx="12.5" cy="12.5" r="1.75" /><path d="m5.1 7.2 5.8-2.9M5.1 8.8l5.8 2.9" /></>,
  upload: <path d="M8 10.5V2.5M4.75 5.75 8 2.5l3.25 3.25M2.5 10.5v2.25a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10.5" />,
  download: <path d="M8 2.5v8M4.75 7.25 8 10.5l3.25-3.25M2.5 10.5v2.25a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10.5" />,
  trash: <path d="M2.75 4.25h10.5M6.25 4.25V2.75h3.5v1.5M4 4.25l.6 9a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95l.6-9" />,
  edit: <path d="m10.25 2.75 3 3-7.5 7.5H2.75v-3z" />,
  summary: <><rect x="1.75" y="1.75" width="5.25" height="5.25" rx="1" /><rect x="9" y="1.75" width="5.25" height="5.25" rx="1" /><rect x="1.75" y="9" width="12.5" height="5.25" rx="1" /></>,
  list: <path d="M5.5 3.5h8.5M5.5 8h8.5M5.5 12.5h8.5M2 3.5h.5M2 8h.5M2 12.5h.5" />,
  calendar: <><rect x="1.75" y="2.75" width="12.5" height="11.5" rx="1.5" /><path d="M1.75 6.5h12.5M5 1.5v2.5M11 1.5v2.5M4.5 9.25h1M7.5 9.25h1M10.5 9.25h1M4.5 11.75h1M7.5 11.75h1" /></>,
  link: <><path d="M6.75 9.25a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5l-.75.75" /><path d="M9.25 6.75a2.5 2.5 0 0 0-3.5 0l-2.5 2.5a2.5 2.5 0 0 0 3.5 3.5l.75-.75" /></>,
  activity: <path d="M1.5 8h3l2-5 3 10 2-5h3" />,
  columns: <><rect x="1.75" y="2.75" width="12.5" height="10.5" rx="1.5" /><path d="M6 2.75v10.5M10 2.75v10.5" /></>,
  arrowUp: <path d="M8 13V3M4 7l4-4 4 4" />,
  arrowDown: <path d="M8 3v10M4 9l4 4 4-4" />,
  chevronLeft: <path d="M10 3.5 5.5 8l4.5 4.5" />,
  refresh: <><path d="M13.25 8a5.25 5.25 0 1 1-1.54-3.71" /><path d="M13.25 2.5v3h-3" /></>,
  copy: <><rect x="5.25" y="5.25" width="8.5" height="8.5" rx="1.25" /><path d="M10.75 5.25V3.5a1.25 1.25 0 0 0-1.25-1.25h-6A1.25 1.25 0 0 0 2.25 3.5v6a1.25 1.25 0 0 0 1.25 1.25h1.75" /></>,
  megaphone: <><path d="M2.25 6.25v3.5h2.5l6 3.25V3l-6 3.25z" /><path d="M5.25 9.75 6.25 13.5M13 6.25v3.5" /></>,
  expand: <path d="M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9" />,
  info: <><circle cx="8" cy="8" r="6.25" /><path d="M8 7.25V11M8 5h.01" /></>,
  chart: <path d="M2.5 13.5h11M4.5 11V8M8 11V4.5M11.5 11V6.5" />,
  code: <path d="M5.5 4 1.75 8l3.75 4M10.5 4l3.75 4-3.75 4M9.25 2.75l-2.5 10.5" />,
  inbox: <><path d="M1.75 9.25 3.5 3.25h9l1.75 6v3.5a1 1 0 0 1-1 1H2.75a1 1 0 0 1-1-1z" /><path d="M1.75 9.25h3.5l1 1.75h3.5l1-1.75h3.5" /></>,
};

export default function NavIcon({ name, size = 16, className = '', filled = false }) {
  const shape = PATHS[name];
  if (!shape) return null;
  return (
    <svg
      className={`nav-icon ${className}`.trim()}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shape}
    </svg>
  );
}
