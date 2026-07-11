const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://raw.githubusercontent.com/hessu/aprs-symbols/master/png';
const DEST_DIR = path.join(__dirname, '..', 'icons', 'symbols');
const SPRITE_SIZE = 24;
const COLS = 16;
const ROWS = 8;

// Symbol code mapping: ASCII 33-126
const FIRST_CODE = 33;
const LAST_CODE = 126;

function download(url, dest) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
    });
}

async function main() {
    console.log('Downloading sprite sheets from hessu/aprs-symbols...');
    const sheets = [
        { name: 'primary', file: 'aprs-symbols-24-0.png' },
        { name: 'alternate', file: 'aprs-symbols-24-1.png' },
    ];

    // Try to use canvas (node-canvas). If not available, try sharp. Otherwise error.
    let createCanvas, loadImage;
    try {
        const canvasPkg = require('canvas');
        createCanvas = canvasPkg.createCanvas;
        loadImage = canvasPkg.loadImage;
        console.log('Using node-canvas for image processing');
    } catch (e) {
        console.log('node-canvas not available, trying alternative...');
        // We'll use a simpler approach: write PNGs by manual byte manipulation
        // But first try if sharp is available
        let sharp;
        try { sharp = require('sharp'); } catch (_) {}
        if (sharp) {
            console.log('Using sharp for image processing');
            await extractWithSharp(sharp, sheets);
            return;
        }
        console.log('ERROR: Need either "canvas" or "sharp" npm package.');
        console.log('Run: npm install canvas');
        console.log('  or: npm install sharp');
        process.exit(1);
    }

    for (const sheet of sheets) {
        const dir = path.join(DEST_DIR, sheet.name);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const url = `${BASE_URL}/${sheet.file}`;
        console.log(`Downloading ${sheet.file}...`);
        const buf = await download(url, dir + '_tmp.png');
        fs.writeFileSync(dir + '_tmp.png', buf);

        const img = await loadImage(dir + '_tmp.png');
        const canvas = createCanvas(img.width, img.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);

        let ok = 0;
        for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
            const idx = code - FIRST_CODE;
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const sx = col * SPRITE_SIZE;
            const sy = row * SPRITE_SIZE;

            const symCanvas = createCanvas(SPRITE_SIZE, SPRITE_SIZE);
            const symCtx = symCanvas.getContext('2d');
            symCtx.drawImage(img, sx, sy, SPRITE_SIZE, SPRITE_SIZE, 0, 0, SPRITE_SIZE, SPRITE_SIZE);

            const outPath = path.join(dir, `${code}.png`);
            fs.writeFileSync(outPath, symCanvas.toBuffer('image/png'));
            ok++;
        }
        console.log(`  ${sheet.name}: ${ok} symbols extracted`);
        fs.unlinkSync(dir + '_tmp.png');
    }
    console.log('Done!');
}

async function extractWithSharp(sharp, sheets) {
    for (const sheet of sheets) {
        const dir = path.join(DEST_DIR, sheet.name);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

        const url = `${BASE_URL}/${sheet.file}`;
        console.log(`Downloading ${sheet.file}...`);
        const buf = await download(url, dir + '_tmp.png');
        fs.writeFileSync(dir + '_tmp.png', buf);

        const metadata = await sharp(dir + '_tmp.png').metadata();
        let ok = 0;
        for (let code = FIRST_CODE; code <= LAST_CODE; code++) {
            const idx = code - FIRST_CODE;
            const col = idx % COLS;
            const row = Math.floor(idx / COLS);
            const sx = col * SPRITE_SIZE;
            const sy = row * SPRITE_SIZE;

            const outPath = path.join(dir, `${code}.png`);
            await sharp(dir + '_tmp.png')
                .extract({ left: sx, top: sy, width: SPRITE_SIZE, height: SPRITE_SIZE })
                .png()
                .toFile(outPath);
            ok++;
        }
        console.log(`  ${sheet.name}: ${ok} symbols extracted`);
        fs.unlinkSync(dir + '_tmp.png');
    }
    console.log('Done!');
}

main().catch(e => { console.error(e); process.exit(1); });
