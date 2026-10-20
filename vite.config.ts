import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `vite build` -> dist/index.html: ONE file with the game, its styles and every
// asset inlined, so it can be dropped into any web view or ad network as is.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  server: { host: '127.0.0.1' },
  build: {
    target: 'es2020', // Android WebView / iOS WKWebView
    assetsInlineLimit: 100_000_000, // images and sounds become data URIs
    chunkSizeWarningLimit: 20_000,
  },
});
