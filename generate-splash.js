import { createCanvas, loadImage } from 'canvas';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateSplash() {
    const logoPath = path.join(__dirname, 'icons', 'icon-512.png');
    const outputPath = path.join(__dirname, 'assets', 'splash.png');

    // Load the logo
    const logo = await loadImage(logoPath);

    // Create canvas - Android splash screens are typically 2732x2732 for xxhdpi
    const canvas = createCanvas(2732, 2732);
    const ctx = canvas.getContext('2d');

    // Fill background with dark navy (#0a0d14)
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, 2732, 2732);

    // Draw logo centered
    const logoSize = 800; // Logo size in pixels
    const logoX = (2732 - logoSize) / 2;
    const logoY = (2732 - logoSize) / 2 - 100; // Slightly above center
    ctx.drawImage(logo, logoX, logoY, logoSize, logoSize);

    // Draw "by XE2LDL" text
    ctx.font = 'bold 72px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#3b9fd4'; // Blue color from CSS --accent2
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const text = 'by XE2LDL';
    const textX = 2732 / 2;
    const textY = logoY + logoSize + 100; // Below logo
    ctx.fillText(text, textX, textY);

    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(outputPath, buffer);
    console.log('Splash screen generated:', outputPath);
}

generateSplash().catch(console.error);