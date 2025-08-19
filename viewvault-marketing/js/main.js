// ViewVault Marketing Site JavaScript

// Navbar scroll effect
window.addEventListener('scroll', function() {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
});

// Smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});

// Intersection Observer for animations
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver(function(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('fade-in-up');
        }
    });
}, observerOptions);

// Observe elements for animation
document.querySelectorAll('.feature-card, .screenshot-item, .platform-card').forEach(el => {
    observer.observe(el);
});

// Video placeholder click handler
const videoPlaceholder = document.querySelector('.video-placeholder');
if (videoPlaceholder) {
    videoPlaceholder.addEventListener('click', function() {
        // Check if there's a video element with a valid source
        const videoElement = document.querySelector('.video-container video');
        if (videoElement && videoElement.src && videoElement.src !== window.location.href) {
            videoElement.style.display = 'block';
            this.style.display = 'none';
            videoElement.play().catch(e => {
                console.log('Video playback failed:', e);
                alert('Please add your demo video to ./assets/videos/viewvault-demo.mp4');
            });
        } else {
            alert('Please add your demo video to ./assets/videos/viewvault-demo.mp4');
        }
    });
}

// Mobile menu toggle (basic implementation)
document.getElementById('mobileMenuToggle').addEventListener('click', function() {
    const navMenu = document.querySelector('.nav-menu');
    
    // Toggle mobile menu visibility
    if (navMenu.style.display === 'flex') {
        navMenu.style.display = 'none';
    } else {
        navMenu.style.display = 'flex';
        navMenu.style.flexDirection = 'column';
        navMenu.style.position = 'absolute';
        navMenu.style.top = '100%';
        navMenu.style.left = '0';
        navMenu.style.right = '0';
        navMenu.style.background = 'white';
        navMenu.style.padding = '20px';
        navMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        navMenu.style.zIndex = '999';
    }
});

// Close mobile menu when clicking outside
document.addEventListener('click', function(e) {
    const mobileToggle = document.getElementById('mobileMenuToggle');
    const navMenu = document.querySelector('.nav-menu');
    
    if (!mobileToggle.contains(e.target) && !navMenu.contains(e.target)) {
        if (window.innerWidth <= 768) {
            navMenu.style.display = 'none';
        }
    }
});

// Handle window resize
window.addEventListener('resize', function() {
    const navMenu = document.querySelector('.nav-menu');
    if (window.innerWidth > 768) {
        navMenu.style.display = 'flex';
        navMenu.style.flexDirection = 'row';
        navMenu.style.position = 'static';
        navMenu.style.background = 'transparent';
        navMenu.style.padding = '0';
        navMenu.style.boxShadow = 'none';
    } else {
        navMenu.style.display = 'none';
    }
});

// Performance optimization: Debounce scroll events
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Apply debounced scroll handler
const debouncedScrollHandler = debounce(function() {
    const navbar = document.getElementById('navbar');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
    }
}, 10);

window.addEventListener('scroll', debouncedScrollHandler);

// Analytics and tracking (placeholder)
function trackEvent(action, category, label) {
    // Add your analytics tracking here
    // Example: gtag('event', action, { event_category: category, event_label: label });
    console.log('Event tracked:', { action, category, label });
}

// Track CTA clicks
document.querySelectorAll('.btn-primary, .cta-button').forEach(button => {
    button.addEventListener('click', function() {
        trackEvent('click', 'CTA', this.textContent.trim());
    });
});

// Track navigation clicks
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function() {
        trackEvent('click', 'Navigation', this.textContent.trim());
    });
});

// Lazy loading for images (if needed)
if ('IntersectionObserver' in window) {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src;
                    img.classList.remove('lazy');
                    observer.unobserve(img);
                }
            }
        });
    });

    document.querySelectorAll('img[data-src]').forEach(img => {
        imageObserver.observe(img);
    });
}

// Console easter egg for developers
console.log(`
🎬 ViewVault Marketing Site
Built with modern web technologies
Want to contribute? Check out our GitHub!
`);

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', function() {
    // Initialize any components that need DOM to be ready
    console.log('ViewVault marketing site loaded successfully!');
    
    // Add loading animation cleanup if needed
    const loader = document.querySelector('.loading');
    if (loader) {
        loader.style.display = 'none';
    }
});
