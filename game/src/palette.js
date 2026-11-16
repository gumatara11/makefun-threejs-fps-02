// DUSTLINE look plan: concrete grey, sodium amber, teal accents. The same names are the
// CSS custom properties in index.html, plus --teal for attacker markers and plant lines.
export const PALETTE = {
  canvas: '#3a3f46',
  surface: '#4a4f57',
  hairline: '#5a5f68',
  ink: '#e9e6df',
  muted: '#98a0a8',
  accent: '#f0a830',
  teal: '#2ec4b6',
  // Stage 1 (anime environment) — new keys only; existing values untouched.
  steelblue: '#46667c',
  wood: '#7a5a38',
  leaf: '#4a8a3a',
  leafDark: '#2f6a2a',
  trunk: '#5a4030',
  roof: '#23262b',
};

export function shade(name) {
  return PALETTE[name];
}
