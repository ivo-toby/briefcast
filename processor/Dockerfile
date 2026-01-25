# Briefcast Processor - Podcast generation with FFmpeg audio normalization
# Build from monorepo root: docker build -f processor/Dockerfile -t briefcast-processor .
FROM node:20-alpine

# Install FFmpeg for audio processing
RUN apk add --no-cache ffmpeg

# Create app directory
WORKDIR /app

# Create temp directory for audio processing
RUN mkdir -p /tmp/briefcast

# Copy root package files and lockfile
COPY package.json package-lock.json ./

# Copy workspace package.json files for dependency resolution
COPY shared/package.json ./shared/
COPY processor/package.json ./processor/

# Install all dependencies (including workspace links)
RUN npm ci --ignore-scripts

# Copy ONLY compiled dist folders (not source files)
COPY shared/dist/ ./shared/dist/
COPY processor/dist/ ./processor/dist/

# Set environment
ENV NODE_ENV=production
ENV TEMP_DIR=/tmp/briefcast

# Set working directory to processor
WORKDIR /app/processor

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "console.log('healthy')" || exit 1

# Run the processor
CMD ["node", "dist/index.js"]
