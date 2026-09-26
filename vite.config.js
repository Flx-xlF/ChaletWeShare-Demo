import { defineConfig } from 'vite';
import { writeFileSync, cpSync, existsSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';

// Generate a unique build version (Unix timestamp in ms)
const APP_VERSION = Date.now().toString();

/**
 * Custom Vite plugin: generates a version.json in the output directory
 * after each build, so the client can poll for new deployments.
 */
function versionPlugin() {
  return {
    name: 'version-json',
    buildStart() {
      const versionData = JSON.stringify({ version: APP_VERSION });
      writeFileSync(resolve('public', 'version.json'), versionData);
    },
    closeBundle() {
      const versionData = JSON.stringify({ version: APP_VERSION });
      const distDir = resolve('dist');
      if (!existsSync(distDir)) {
        mkdirSync(distDir, { recursive: true });
      }
      writeFileSync(resolve(distDir, 'version.json'), versionData);
      console.log(`\n✅ version.json written (version: ${APP_VERSION})`);
    },
  };
}

/**
 * Custom Vite plugin: copies sanitized api/ directory to dist/api/
 * automatically filtering out local databases, schemas, and dev files.
 */
function copyApiPlugin() {
  const EXCLUDED_FILES = new Set([
    'chaletweshare.sqlite',
    'schema.sql',
    'composer.json',
    'composer.lock',
    'config.example.php',
    '.DS_Store'
  ]);

  return {
    name: 'copy-api',
    closeBundle() {
      const apiSrc = resolve('api');
      const apiDest = resolve('dist', 'api');

      if (!existsSync(apiSrc)) return;

      cpSync(apiSrc, apiDest, {
        recursive: true,
        filter: (source) => {
          const file = basename(source);
          // Exclude sqlite files & journals
          if (file.endsWith('.sqlite') || file.endsWith('.sqlite-journal') || file.endsWith('.sqlite-wal') || file.endsWith('.sqlite-shm')) {
            return false;
          }
          // Never leak real or example configuration files
          if (file.startsWith('config.') || file === 'config.php' || file === 'config.example.php') {
            return false;
          }
          // Exclude dev/template files
          if (EXCLUDED_FILES.has(file)) {
            return false;
          }
          return true;
        }
      });
      console.log('✅ Sanitized api/ copied to dist/api/ (sqlite & dev files excluded)\n');
    }
  };
}

export default defineConfig({
  base: './',
  define: {
    // Inject the build version into client code as a global constant
    '__APP_VERSION__': JSON.stringify(APP_VERSION),
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  plugins: [versionPlugin(), copyApiPlugin()],
});
