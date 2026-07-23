import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub project Pages: https://<user>.github.io/varela/
// Override with: vite build --base=/your-repo/
export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/varela/' : '/',
  plugins: [react()],
  assetsInclude: ['**/*.glb'],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          if (
            id.includes('node_modules/@react-three/fiber') ||
            id.includes('node_modules/@react-three/drei')
          ) {
            return 'r3f'
          }
        },
      },
    },
  },
})
