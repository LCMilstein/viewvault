# ViewVault Marketing Website

A beautiful, Apple-inspired marketing website for ViewVault - the ultimate watchlist management app for movie and TV enthusiasts.

## 🚀 Quick Start

### Using Docker (Recommended)

```bash
# Clone or navigate to this directory
cd ViewVault-marketing-site

# Build and run with Docker Compose
docker-compose up -d

# Visit http://localhost:3000
```

### Development Mode

```bash
# Run with development profile (hot reloading)
docker-compose --profile dev up -d

# Visit http://localhost:3001 for development server
```

### Manual Setup

```bash
# Serve with any static file server
python -m http.server 8000
# or
npx serve .
# or
php -S localhost:8000
```

## 📁 Project Structure

```
ViewVault-marketing-site/
├── index.html              # Main HTML file
├── css/
│   └── styles.css          # All CSS styles
├── js/
│   └── main.js             # JavaScript functionality
├── assets/
│   ├── images/             # Screenshots, hero images, etc.
│   ├── videos/             # Demo videos
│   └── icons/              # Favicons and icons
├── Dockerfile              # Docker configuration
├── docker-compose.yml      # Docker Compose setup
├── nginx.conf              # Nginx configuration
└── README.md               # This file
```

## 🎨 Features

- **Apple-inspired Design**: Clean, modern aesthetic with smooth animations
- **Responsive Layout**: Works perfectly on desktop, tablet, and mobile
- **Performance Optimized**: Fast loading with optimized assets
- **SEO Ready**: Proper meta tags and semantic HTML
- **Docker Ready**: Easy deployment with containerization

## 📸 Adding Your Assets

### Screenshots
Add your app screenshots to:
- `./assets/images/screenshot-dashboard.png` - Main dashboard
- `./assets/images/screenshot-create-list.png` - List creation
- `./assets/images/screenshot-search.png` - Search interface
- `./assets/images/screenshot-mobile.png` - Mobile app
- `./assets/images/screenshot-admin.png` - Admin panel
- `./assets/images/screenshot-collections.png` - Collections view

### Hero Image
- `./assets/images/hero-screenshot.png` - Main hero image

### Demo Video
- `./assets/videos/ViewVault-demo.mp4` - Product demo video
- `./assets/videos/demo-poster.jpg` - Video poster/thumbnail

### Icons & Branding
- `./assets/icons/favicon-32x32.png`
- `./assets/icons/favicon-16x16.png`
- `./assets/icons/apple-touch-icon.png`
- `./assets/images/og-image.jpg` - Social media preview

## 🔧 Customization

### Update Links
Replace placeholder URLs in `index.html`:
- `https://your-ViewVault-app.com` - Your app URL
- `https://github.com/yourusername/ViewVault` - Your GitHub repo

### Modify Content
- Update hero text and descriptions
- Add/remove feature cards
- Customize footer links
- Update meta descriptions for SEO

### Styling
- Modify CSS variables in `css/styles.css`
- Colors, fonts, spacing all controlled via CSS custom properties
- Responsive breakpoints at 768px

## 🚀 Deployment Options

### GitHub Pages (Free)
1. Push to GitHub repository
2. Enable GitHub Pages in repo settings
3. Choose source: GitHub Actions or branch
4. Your site will be available at `username.github.io/repo-name`

### Docker on VPS
```bash
# On your server
git clone <your-repo>
cd ViewVault-marketing-site
docker-compose up -d

# Setup reverse proxy (nginx/traefik) for custom domain
```

### Netlify/Vercel (Easy)
1. Connect your GitHub repo
2. Auto-deploys on every push
3. Free custom domains and SSL

### AWS S3 + CloudFront
- Host static files on S3
- Use CloudFront for global CDN
- Route 53 for custom domain

## 🔍 SEO & Analytics

### Add Analytics
Update `js/main.js` to include your tracking:
```javascript
// Replace the trackEvent function with your analytics
function trackEvent(action, category, label) {
    gtag('event', action, { event_category: category, event_label: label });
}
```

### SEO Checklist
- [ ] Add your actual domain to Open Graph tags
- [ ] Create and add `sitemap.xml`
- [ ] Add `robots.txt`
- [ ] Optimize image alt texts
- [ ] Add structured data markup

## 🛠️ Development

### Local Development
```bash
# Watch for changes (if using build tools)
npm run dev

# Or use Docker development mode
docker-compose --profile dev up
```

### Adding Build Tools (Optional)
```bash
# Add package.json for build tools
npm init -y
npm install -D sass postcss autoprefixer

# Add build scripts to package.json
```

## 📱 Progressive Web App (Optional)

To make this a PWA:
1. Add `manifest.json` with app details
2. Implement service worker for offline support
3. Add install prompts

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with Docker
5. Submit a pull request

## 📄 License

This marketing site is part of the ViewVault project. See main project for license details.

## 🆘 Support

- GitHub Issues: Report bugs and feature requests
- Documentation: Check the main ViewVault project
- Community: Join our Discord for help

---

Built with ❤️ for the ViewVault community
