# CineSync Marketing Site Dockerfile
# Multi-stage build for optimized production image

# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files (if you add build tools later)
# COPY package*.json ./
# RUN npm ci --only=production

# Copy source files
COPY . .

# Production stage
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/

# Copy static files
COPY --from=builder /app /usr/share/nginx/html

# Set proper permissions
RUN chmod -R 755 /usr/share/nginx/html

# Create nginx user if not exists
RUN addgroup -g 101 -S nginx || true
RUN adduser -S -D -H -u 101 -h /var/cache/nginx -s /sbin/nologin -G nginx -g nginx nginx || true

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost/ || exit 1

# Expose port
EXPOSE 80

# Labels for metadata
LABEL maintainer="CineSync Team"
LABEL version="1.0"
LABEL description="CineSync Marketing Website"

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
