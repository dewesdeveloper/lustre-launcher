import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so assets resolve when loaded via file:// in Electron
  base: './',
  plugins: [
    tailwindcss(),  
    react()
  ],
})
