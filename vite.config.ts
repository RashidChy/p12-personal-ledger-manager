import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vitest configuration lives in vitest.config.ts (node environment, pure domain tests).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1200,
  },
})
