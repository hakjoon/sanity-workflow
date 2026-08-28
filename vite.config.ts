import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * GitHub Pages serves this from /sanity-workflow/, so the build has to emit
 * asset URLs prefixed with that. Without it Vite writes root-absolute paths
 * (/assets/…, /ds/…) which resolve to hakjoon.github.io/assets/… and 404.
 *
 * Build-only: the dev server keeps serving from / rather than making you
 * visit localhost:5180/sanity-workflow/.
 */
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/sanity-workflow/' : '/',
}))
