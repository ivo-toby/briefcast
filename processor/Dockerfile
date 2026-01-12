# Briefcast Processor - Podcast generation with FFmpeg audio normalization
FROM node:20-alpine

# Install FFmpeg for audio processing
RUN apk add --no-cache ffmpeg

# Create app directory
WORKDIR /app

# Create temp directory for audio processing
RUN mkdir -p /tmp/briefcast

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production --ignore-scripts

# Copy compiled JavaScript
COPY dist/ ./dist/

# Set environment
ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/briefcast

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run the processor
CMD ["node", "dist/index.js"]
