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
