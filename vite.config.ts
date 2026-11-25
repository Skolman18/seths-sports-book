import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base matches the GitHub Pages URL: https://skolman18.github.io/seths-sports-book/
export default defineConfig({
  plugins: [react()],
  base: '/seths-sports-book/',
})
