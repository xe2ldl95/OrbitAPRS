import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Android mipmap sizes (px)
const ICON_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};

// Splash density sizes (px) - Android splash dimensions
const SPLASH_DIRS = [
  { dir: 'drawable', w: 480, h: 800, label: 'base' },
  { dir: 'drawable-port-mdpi', w: 320, h: 480, label: 'port-mdpi' },
  { dir: 'drawable-port-hdpi', w: 480, h: 800, label: 'port-hdpi' },
  { dir: 'drawable-port-xhdpi', w: 720, h: 1280, label: 'port-xhdpi' },
  { dir: 'drawable-port-xxhdpi', w: 1080, h: 1920, label: 'port-xxhdpi' },
  { dir: 'drawable-port-xxxhdpi', w: 1440, h: 2560, label: 'port-xxxhdpi' },
  { dir: 'drawable-land-mdpi', w: 480, h: 320, label: 'land-mdpi' },
  { dir: 'drawable-land-hdpi', w: 800, h: 480, label: 'land-hdpi' },
  { dir: 'drawable-land-xhdpi', w: 1280, h: 720, label: 'land-xhdpi' },
  { dir: 'drawable-land-xxhdpi', w: 1920, h: 1080, label: 'land-xxhdpi' },
  { dir: 'drawable-land-xxxhdpi', w: 2560, h: 1440, label: 'land-xxxhdpi' },
  { dir: 'drawable-xxxhdpi', w: 1440, h: 2560, label: 'xxxhdpi' },
];

function drawSplash(ctx, w, h, logo, logoSize) {
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(0, 0, w, h);

  const size = Math.min(w, h) * logoSize;
  const lx = (w - size) / 2;
  const ly = (h - size) / 2 - (h * 0.04);
  ctx.drawImage(logo, lx, ly, size, size);

  const fontSize = Math.round(Math.min(w, h) * 0.035);
  ctx.font = `bold ${fontSize}px "Segoe UI", Arial, sans-serif`;
  ctx.fillStyle = '#3b9fd4';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('by XE2LDL', w / 2, ly + size + fontSize * 1.5);
}

async function generateIcons(logo) {
  const resDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

  for (const [mipmapDir, size] of Object.entries(ICON_SIZES)) {
    const dirPath = path.join(resDir, mipmapDir);
    if (!fs.existsSync(dirPath)) continue;

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(logo, 0, 0, size, size);

    const pngBuffer = canvas.toBuffer('image/png');

    // ic_launcher.png - full icon
    fs.writeFileSync(path.join(dirPath, 'ic_launcher.png'), pngBuffer);
    // ic_launcher_round.png - same (Android rounds it)
    fs.writeFileSync(path.join(dirPath, 'ic_launcher_round.png'), pngBuffer);
    // ic_launcher_foreground.png - same for adaptive (background provides color)
    fs.writeFileSync(path.join(dirPath, 'ic_launcher_foreground.png'), pngBuffer);

    console.log(`  ${mipmapDir} (${size}x${size})`);
  }
}

async function generateSplash(logo) {
  const resDir = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

  for (const { dir, w, h, label } of SPLASH_DIRS) {
    const dirPath = path.join(resDir, dir);
    if (!fs.existsSync(dirPath)) continue;

    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    drawSplash(ctx, w, h, logo, 0.28);

    const filePath = path.join(dirPath, 'splash.png');
    fs.writeFileSync(filePath, canvas.toBuffer('image/png'));
    console.log(`  ${label} (${w}x${h})`);
  }
}

async function main() {
  console.log('Loading icon-512.png...');
  const logo = await loadImage(path.join(rootDir, 'icons', 'icon-512.png'));
  console.log();

  console.log('Generating icons...');
  await generateIcons(logo);
  console.log();

  console.log('Generating splash screens...');
  await generateSplash(logo);
  console.log();

  // Fix icon background color to navy
  console.log('Fixing icon background color...');
  const bgXmlPath = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(bgXmlPath, `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0a0d14</color>
</resources>
`);
  console.log('  ic_launcher_background.xml -> #0a0d14');

  // Remove old vector drawables that had wrong images
  const oldBg = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'drawable', 'ic_launcher_background.xml');
  const oldFg = path.join(rootDir, 'android', 'app', 'src', 'main', 'res', 'drawable-v24', 'ic_launcher_foreground.xml');

  if (fs.existsSync(oldBg)) {
    fs.writeFileSync(oldBg, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportHeight="108"
    android:viewportWidth="108">
    <path
        android:fillColor="#0a0d14"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`);
    console.log('  drawable/ic_launcher_background.xml -> solid navy');
  }

  if (fs.existsSync(oldFg)) {
    fs.writeFileSync(oldFg, `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportHeight="108"
    android:viewportWidth="108">
    <path
        android:fillColor="#0a0d14"
        android:pathData="M0,0h108v108h-108z" />
</vector>
`);
    console.log('  drawable-v24/ic_launcher_foreground.xml -> solid navy');
  }

  console.log('\nDone! All assets regenerated.');
}

main().catch(console.error);
