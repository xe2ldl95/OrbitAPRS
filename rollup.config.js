import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

const isDev = process.env.NODE_ENV !== 'production';

export default {
  input: 'js/app.js',
  output: {
    file: 'dist/app.js',
    format: 'iife',
    name: 'app',
    sourcemap: !isDev,
    globals: {
      'satellite.js': 'satellite',
      'leaflet': 'L'
    }
  },
  plugins: [
    resolve(),
    commonjs(),
    copy({
      targets: [
        { src: 'index.html', dest: 'dist' },
        { src: 'manifest.json', dest: 'dist' },
        { src: 'sw.js', dest: 'dist' },
        { src: 'css/', dest: 'dist/css' },
        { src: 'js/', dest: 'dist/js' },
        { src: 'icons/', dest: 'dist/icons' }
      ]
    }),
    !isDev && terser()
  ].filter(Boolean),
  external: ['satellite.js', 'leaflet']
};