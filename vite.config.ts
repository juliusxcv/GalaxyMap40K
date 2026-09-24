import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Served from https://<user>.github.io/GalaxyMap40K/, not the domain
  // root, so every asset URL needs this prefix.
  base: '/GalaxyMap40K/',
  plugins: [react()],
})
