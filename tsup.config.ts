import { defineConfig } from 'tsup'

export default defineConfig([
  // Library build (external deps)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    dts: true,
    clean: true,
  },
  // Playground bundle (all deps inlined) — used by dev and GitHub Pages
  {
    entry: { 'bundle': 'src/index.ts' },
    format: ['esm'],
    dts: false,
    noExternal: [/@chenglou\/pretext/, /hyphen/],
    outDir: 'docs',
  },
])
