const fs = require('fs');
const path = require('path');

// iOS App Icon Sizes Required
const iconSizes = [
    { name: 'Icon-App-20x20@2x', size: 40 },
    { name: 'Icon-App-20x20@3x', size: 60 },
    { name: 'Icon-App-29x29@2x', size: 58 },
    { name: 'Icon-App-29x29@3x', size: 87 },
    { name: 'Icon-App-40x40@2x', size: 80 },
    { name: 'Icon-App-40x40@3x', size: 120 },
    { name: 'Icon-App-60x60@2x', size: 120 },
    { name: 'Icon-App-60x60@3x', size: 180 },
    { name: 'Icon-App-76x76@1x', size: 76 },
    { name: 'Icon-App-76x76@2x', size: 152 },
    { name: 'Icon-App-83.5x83.5@2x', size: 167 },
    { name: 'Icon-App-1024x1024@1x', size: 1024 }
];

// SVG Content for ViewVault Icon
const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <!-- Darker Eggplant Background -->
  <rect width="1024" height="1024" fill="#2a1b3d" rx="200"/>
  
  <!-- Purple Highlight Behind V -->
  <defs>
    <radialGradient id="purpleGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" style="stop-color:#533483;stop-opacity:0.8"/>
      <stop offset="70%" style="stop-color:#533483;stop-opacity:0.3"/>
      <stop offset="100%" style="stop-color:#2a1b3d;stop-opacity:0"/>
    </radialGradient>
  </defs>
  
  <!-- Purple Glow Circle -->
  <circle cx="512" cy="512" r="300" fill="url(#purpleGlow)"/>
  
  <!-- Main V Shape with Shading -->
  <defs>
    <linearGradient id="vGradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#00d4aa"/>
      <stop offset="50%" style="stop-color:#00b894"/>
      <stop offset="100%" style="stop-color:#00a085"/>
    </linearGradient>
  </defs>
  
  <!-- V with Gradient and Sharp Edges -->
  <path d="M 200 300 L 512 700 L 824 300 L 700 300 L 512 600 L 324 300 Z" fill="url(#vGradient)"/>
  
  <!-- V Edge Highlights for Sharpness -->
  <path d="M 200 300 L 512 700 L 824 300" stroke="#00d4aa" stroke-width="8" fill="none" stroke-linecap="round"/>
  <path d="M 200 300 L 324 300 L 512 600 L 700 300 L 824 300" stroke="#00d4aa" stroke-width="4" fill="none" stroke-linecap="round"/>
  
  <!-- List Elements with Subtle Shading -->
  <circle cx="400" cy="800" r="40" fill="#00d4aa"/>
  <circle cx="400" cy="800" r="35" fill="#00b894"/>
  
  <circle cx="512" cy="800" r="40" fill="#00d4aa"/>
  <circle cx="512" cy="800" r="35" fill="#00b894"/>
  
  <circle cx="624" cy="800" r="40" fill="#00d4aa"/>
  <circle cx="624" cy="800" r="35" fill="#00b894"/>
</svg>`;

// Create icons directory if it doesn't exist
const iconsDir = path.join(__dirname, 'ViewVault-Icons');
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
}

// Generate each icon size
iconSizes.forEach(icon => {
    const svgWithSize = svgContent.replace('width="1024" height="1024"', `width="${icon.size}" height="${icon.size}"`);
    const svgWithViewBox = svgWithSize.replace('viewBox="0 0 1024 1024"', `viewBox="0 0 ${icon.size} ${icon.size}"`);
    
    const filePath = path.join(iconsDir, `${icon.name}.svg`);
    fs.writeFileSync(filePath, svgWithViewBox);
    console.log(`Created: ${icon.name}.svg (${icon.size}x${icon.size})`);
});

console.log('\nAll ViewVault icons generated!');
console.log('Note: These are SVG files. For iOS, you\'ll need to convert them to PNG.');
console.log('You can use online tools or design apps to convert SVG to PNG.');
console.log('Or use the existing icon generation scripts in your project.');
