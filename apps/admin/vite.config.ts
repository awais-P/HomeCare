import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // The map library alone is ~800 kB; that's expected for an internal admin tool.
  build: { chunkSizeWarningLimit: 1500 },
});
