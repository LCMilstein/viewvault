const fs = require('fs');
const path = require('path');

// Create a simple HTML file that will generate the icons using Canvas
const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>App Icon Generator</title>
</head>
<body>
    <canvas id="canvas" style="display: none;"></canvas>
    <script>
        const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        
        // Color scheme: dark eggplant background, aqua/mint icon
        const backgroundColor = '#1a0a1a'; // Dark eggplant
        const iconColor = '#00d4aa'; // Aqua/mint
        
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
        
        function generateIcon(size, scale, filename) {
            const pixelSize = size * scale;
            canvas.width = pixelSize;
            canvas.height = pixelSize;
            
            // Fill background
            ctx.fillStyle = backgroundColor;
            ctx.fillRect(0, 0, pixelSize, pixelSize);
            
            // Draw a simple "C" icon in aqua/mint
            ctx.fillStyle = iconColor;
            ctx.strokeStyle = iconColor;
            ctx.lineWidth = Math.max(2, pixelSize / 20);
            
            // Draw a stylized "C" for CineSync
            const centerX = pixelSize / 2;
            const centerY = pixelSize / 2;
            const radius = pixelSize * 0.35;
            
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0.3 * Math.PI, 1.7 * Math.PI);
            ctx.stroke();
            
            // Add a small dot to make it look more like a film reel
            ctx.beginPath();
            ctx.arc(centerX + radius * 0.3, centerY - radius * 0.3, radius * 0.15, 0, 2 * Math.PI);
            ctx.fill();
            
            // Convert to blob and download
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

fs.writeFileSync('generate_icons.html', htmlContent);
console.log('HTML file created: generate_icons.html');
console.log('Open this file in a browser to generate the app icons.');
console.log('The icons will be downloaded automatically.');
console.log('');
console.log('After downloading, move the icons to: ios/WatchlistApp/Images.xcassets/AppIcon.appiconset/'); 