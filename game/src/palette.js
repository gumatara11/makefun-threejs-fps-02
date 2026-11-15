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
};

export function shade(name) {
  return PALETTE[name];
}
