import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Relative base so the same build works locally and under
// https://<user>.github.io/pg_durable_showcase/ (routing is hash-based).
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5173 },
});
