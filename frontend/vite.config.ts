import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', 'VITE_')
  if (env.VITE_SUPABASE_PUBLISHABLE_KEY && !env.VITE_SUPABASE_PUBLISHABLE_KEY.startsWith('sb_publishable_')) {
    throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must contain a publishable key, never a server key.')
  }
  if (Object.keys(env).some(name => /SECRET|SERVICE_ROLE|GROQ/i.test(name))) {
    throw new Error('Server credentials must not be present in VITE_ environment variables.')
  }
  if (mode === 'production' && ['VITE_API_URL', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].some(name => !env[name])) {
    throw new Error('Production builds require all three public frontend environment variables.')
  }
  return {
  server: {host: '127.0.0.1'},
  preview: {host: '127.0.0.1'},
  plugins: [
    react(),
    tailwindcss(),
  ],
  }
})