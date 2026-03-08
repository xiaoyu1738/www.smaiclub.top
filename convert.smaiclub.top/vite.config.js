import { defineConfig } from 'vite';

export default defineConfig({
  // Use relative asset URLs so dist works under subpaths like /convert.smaiclub.top/
  base: './',
  build: {
    target: 'esnext'
  },
  worker: {
    format: 'es'
  }
});
