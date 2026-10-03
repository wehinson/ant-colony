const paths = {
  ant: '<ellipse cx="12" cy="17" rx="4" ry="5"/><circle cx="12" cy="9" r="2.5"/><circle cx="12" cy="4" r="2.7"/><path d="m9.8 2-2-2m6.4 2 2-2M9 9 4 6m11 3 5-3M8 13H3m13 0h5M8 17l-5 4m13-4 5 4"/>',
  leaf: '<path d="M20 3c-8-1-16 2-16 9a6 6 0 0 0 6 6c7 0 10-8 10-15Z"/><path d="M4 21 16 8m-8 9v-5m5 0h5"/>',
  crown: '<path d="m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Zm3 15h12"/>',
  egg: '<path d="M19 15a7 7 0 0 1-14 0C5 10 9 3 12 3s7 7 7 12Z"/><path d="M8 15c0 2 1 3 3 3"/>',
  pick: '<path d="m5 21 9-13M7 4c4-3 10 0 13 5l-2 2c-3-4-6-6-11-7Z"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-13h-7l0-7Z"/>',
  shield:
    '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  swords:
    '<path d="m4 3 13 13m-1-13L3 16m18 5-5-5m-2 3 5-5m-16 7 5-5m-3-2 5 5M3 3l1 5 4-4-5-1Zm18 0-1 5-4-4 5-1Z"/>',
  recycle:
    '<path d="m9 4 3-2 4 7m0-4v4h-4m7 2 3 2-4 7m4-3-4 3-2-4M9 21H3l-1-7m-1 3 1-4 4 1m-3-4 3-5"/>',
  bug: '<path d="M8 6a4 4 0 0 1 8 0v12a4 4 0 0 1-8 0V6Zm0 5h8M5 8l3 2m8 0 3-2M4 15h4m8 0h4M5 22l3-3m8 0 3 3M9 3 7 1m8 2 2-2"/>',
  rest: '<path d="M3 18V8m18 10v-6H3m3 0V7h6v5m0-4h5a4 4 0 0 1 4 4M3 18v3m18-3v3"/>',
  target:
    '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="m12 12 9-9m-5 0h5v5"/>',
  tower: '<path d="M4 21h16M7 21V10L5 8V3h4v3h6V3h4v5l-2 2v11M10 21v-5h4v5"/>',
  spray:
    '<path d="M4 13h6v9H4zm1 0V8h4v5M7 8V5h6m3 0h1m3 0h1m-6-3h1m3-1h1m-5 7h1m3 2h1"/>',
  web: '<path d="M12 2v20M2 12h20M5 5l14 14M5 19 19 5M7 7l5-2 5 2 2 5-2 5-5 2-5-2-2-5 2-5Z"/>',
  spike: '<path d="M2 21h20M4 21V8l3 5 5-11 5 11 3-5v13M9 21l3-7 3 7"/>',
  wall: '<path d="M2 5h20v14H2V5Zm0 7h20M9 5v7m6 0v7"/>',
  rooms:
    '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  mouse:
    '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7m-6 1h12"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2"/>',
  pause: '<path d="M8 5v14M16 5v14" stroke-width="3"/>',
  play: '<path d="m7 4 13 8-13 8V4Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3m0 3v.1"/>',
  settings:
    '<path d="m9 3-1 3-3 1-2 4 2 2-1 4 4 3 3-1 3 2 4-2v-4l3-2-1-4-3-1-1-4-4-1-3 2Z"/><circle cx="12" cy="12" r="3"/>',
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18m6-18v18M3 9h18M3 15h18"/>',
  cursor: '<path d="m5 3 14 10-7 1-3 7L5 3Z"/>',
  flag: '<path d="M5 22V3c6-5 8 5 15 0v11c-7 5-9-5-15 0"/>',
  journal:
    '<path d="M4 3h13a3 3 0 0 1 3 3v15H7a3 3 0 0 1-3-3V3Zm0 14h16M8 7h8m-8 4h6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6"/>',
  upload: '<path d="M12 16V4m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  check: '<path d="m5 12 4 4L20 5"/>',
  heart:
    '<path d="M12 21S2 15 2 8a5 5 0 0 1 10-2A5 5 0 0 1 22 8c0 7-10 13-10 13Z"/>',
  seed: '<path d="M12 22V10C3 12 1 5 3 2c8-1 11 3 9 8m0 6c0-8 6-12 10-10 1 7-5 12-10 10Z"/>',
};
export const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.rooms}</svg>`;
