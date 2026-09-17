import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.ts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    // A CLI filter of "src" also matches archived checkouts in tmp/**/src.
    // Only this checkout's source tests are release evidence.
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}'],
  },
}))
