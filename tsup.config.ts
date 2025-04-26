import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/**/*.ts'], // Include all ts files in src
  outDir: 'dist',
  format: ['esm'], // Output ESM format
  dts: true, // Generate declaration files
  splitting: false, // Keep things simple for now
  sourcemap: true, // Generate source maps
  clean: true, // Clean the output directory before build
  publicDir: 'src/email-templates', // Copy this directory to dist/email-templates
  // Note: If you have other assets (like images), you might need a more complex 
  // asset handling strategy (e.g., using the 'copy' plugin or separate copy commands 
  // if publicDir isn't sufficient)
}); 