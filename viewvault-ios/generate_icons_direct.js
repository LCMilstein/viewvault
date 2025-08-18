const fs = require('fs');
const path = require('path');

// Create a simple SVG-based icon generator
function createSVGIcon(size, scale) {
    const pixelSize = size * scale;
    const backgroundColor = '#1a0a1a'; // Dark eggplant
    const iconColor = '#00d4aa'; // Aqua/mint
    
    const svg = `
<svg width="${pixelSize}" height="${pixelSize}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${pixelSize}" height="${pixelSize}" fill="${backgroundColor}"/>
    <circle cx="${pixelSize/2}" cy="${pixelSize/2}" r="${pixelSize * 0.35}" fill="none" stroke="${iconColor}" stroke-width="${Math.max(2, pixelSize/20)}"/>
    <circle cx="${pixelSize/2 + pixelSize * 0.12}" cy="${pixelSize/2 - pixelSize * 0.12}" r="${pixelSize * 0.05}" fill="${iconColor}"/>
</svg>`;
    
    return svg;
}

// For now, let's create simple placeholder PNG files using a different approach
// We'll create a simple script that generates base64-encoded minimal PNGs
function createMinimalPNG(size, scale) {
    const pixelSize = size * scale;
    
    // Create a minimal PNG header for a solid color image
    // This is a simplified approach - in practice, you'd want to use a proper PNG library
    
    // For now, let's create a simple approach using a data URL
    const canvas = `
<canvas width="${pixelSize}" height="${pixelSize}" id="canvas${size}${scale}"></canvas>
<script>
const canvas = document.getElementById('canvas${size}${scale}');
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#1a0a1a';
ctx.fillRect(0, 0, ${pixelSize}, ${pixelSize});
ctx.strokeStyle = '#00d4aa';
ctx.lineWidth = ${Math.max(2, pixelSize/20)};
ctx.beginPath();
ctx.arc(${pixelSize/2}, ${pixelSize/2}, ${pixelSize * 0.35}, 0, 2 * Math.PI);
ctx.stroke();
ctx.fillStyle = '#00d4aa';
ctx.beginPath();
ctx.arc(${pixelSize/2 + pixelSize * 0.12}, ${pixelSize/2 - pixelSize * 0.12}, ${pixelSize * 0.05}, 0, 2 * Math.PI);
ctx.fill();
</script>`;
    
    return canvas;
}

// Let's create a simple HTML file that will generate all the required icons
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>CineSync App Icon Generator</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        .icon-preview { display: inline-block; margin: 10px; text-align: center; }
        canvas { border: 1px solid #ccc; }
    </style>
</head>
<body>
    <h1>CineSync App Icon Generator</h1>
    <p>This will generate all required app icons with dark eggplant background and aqua/mint icon.</p>
    
    <div id="icons"></div>
    
    <script>
        const sizes = [
            { size: 20, scale: 2, filename: 'Icon-App-20x20@2x.png' },
            { size: 20, scale: 3, filename: 'Icon-App-20x20@3x.png' },
            { size: 29, scale: 2, filename: 'Icon-App-29x29@2x.png' },
            { size: 29, scale: 3, filename: 'Icon-App-29x29@3x.png' },
            { size: 40, scale: 2, filename: 'Icon-App-40x40@2x.png' },
            { size: 40, scale: 3, filename: 'Icon-App-40x40@3x.png' },
            { size: 60, scale: 2, filename: 'Icon-App-60x60@2x.png' },
            { size: 60, scale: 3, filename: 'Icon-App-60x60@3x.png' },
            { size: 1024, scale: 1, filename: 'Icon-App-1024x1024@1x.png' }
        ];
        
        const backgroundColor = '#1a0a1a'; // Dark eggplant
        const iconColor = '#00d4aa'; // Aqua/mint
        
        function generateIcon(size, scale, filename) {
            const pixelSize = size * scale;
            const canvas = document.createElement('canvas');
            canvas.width = pixelSize;
            canvas.height = pixelSize;
            const ctx = canvas.getContext('2d');
            
            // Fill background
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, pixelSize, pixelSize);
            
            // Draw a stylized "C" for CineSync
            ctx.strokeStyle = iconColor;
            ctx.lineWidth = Math.max(2, pixelSize / 20);
            
            const centerX = pixelSize / 2;
            const centerY = pixelSize / 2;
            const radius = pixelSize * 0.35;
            
            // Draw the main circle (film reel)
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.3 * Math.PI, 1.7 * Math.PI);
            ctx.stroke();
            
            // Add a small dot (film reel hole)
            ctx.fillStyle = iconColor;
            ctx.beginPath();
            ctx.arc(centerX + radius * 0.3, centerY - radius * 0.3, radius * 0.15, 0, 2 * Math.PI);
            ctx.fill();
            
            // Display preview
            const container = document.createElement('div');
            container.className = 'icon-preview';
            container.innerHTML = \`<canvas width="\${pixelSize}" height="\${pixelSize}"></canvas><br>\${filename}\`;
            container.querySelector('canvas').getContext('2d').drawImage(canvas, 0, 0);
            document.getElementById('icons').appendChild(container);
            
            // Download the icon
            canvas.toBlob(function(blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            });
        }
        
        // Generate all icons
        sizes.forEach(({ size, scale, filename }) => {
            setTimeout(() => generateIcon(size, scale, filename), 100);
        });
    </script>
</body>
</html>
`;

fs.writeFileSync('generate_icons_direct.html', htmlContent);
console.log('Direct icon generator created: generate_icons_direct.html');
console.log('Open this file in a browser to generate and download all app icons.');
console.log('');
console.log('After downloading, move all the PNG files to: ios/WatchlistApp/Images.xcassets/AppIcon.appiconset/');
console.log('');
console.log('Then update the Contents.json file to reference the new icon files.'); 