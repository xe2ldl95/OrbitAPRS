const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const isDev = process.argv.includes('--dev');
const watchMode = process.argv.includes('--watch');

const srcDir = __dirname;
const distDir = path.join(srcDir, 'dist');

// Helper function to copy files recursively
function copyFile(src, dest) {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
        if (!fs.existsSync(dest)) {
            fs.mkdirSync(dest, { recursive: true });
        }
        const files = fs.readdirSync(src);
        for (const file of files) {
            copyFile(path.join(src, file), path.join(dest, file));
        }
    } else {
        if (!fs.existsSync(path.dirname(dest))) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
        }
        fs.copyFileSync(src, dest);
    }
}

function build() {
    console.log('Building OrbitAPRS...');
    
    // Clean dist directory
    if (fs.existsSync(distDir)) {
        fs.rmSync(distDir, { recursive: true, force: true });
    }
    
    // Create dist directory
    if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir);
    }
    
    // Copy core files
    const filesToCopy = [
        'index.html',
        'manifest.json',
        'sw.js',
        'css/style.css',
        'js/tnc.js',
        'js/app.js',
        'js/ui.js',
        'js/satellite.js',
        'js/aprs.js',
        'js/logging.js',
        'js/map.js',
        'js/nav.js',
        'js/satellite-lib.js',
        'icons/icon-192.png',
        'icons/icon-512.png'
    ];

    // Copy all files
    for (const file of filesToCopy) {
        const srcPath = path.join(srcDir, file);
        const destPath = path.join(distDir, file);
        if (!fs.existsSync(path.dirname(destPath))) {
            fs.mkdirSync(path.dirname(destPath), { recursive: true });
        }
        fs.copyFileSync(srcPath, destPath);
        console.log(`Copied ${file}`);
    }
    
    // Create version file
    const version = require('./package.json').version;
    fs.writeFileSync(path.join(distDir, 'version.txt'), version);
    
    // Create build info
    const buildInfo = {
        version: version,
        buildDate: new Date().toISOString(),
        builtBy: process.env.USER || 'unknown',
        features: ['tcp-kiss', 'native-install']
    };
    fs.writeFileSync(path.join(distDir, 'build-info.json'), JSON.stringify(buildInfo, null, 2));
    
    console.log('Build completed successfully!');
    
    if (watchMode) {
        console.log('Watching for changes...');
        watchBuild();
    }
}

function watchBuild() {
    const watcher = fs.watch(srcDir, { recursive: true }, (eventType, filename) => {
        if (filename && (filename.endsWith('.js') || filename.endsWith('.html') || filename.endsWith('.css') || filename.endsWith('.json') || filename.endsWith('.png'))) {
            console.log(`File changed: ${filename}, rebuilding...`);
            build();
        }
    });
    
    // Store watcher reference for cleanup
    watchBuild.watcher = watcher;
}

build();