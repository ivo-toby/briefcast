#!/bin/bash
#
# Build and deploy Briefcast Processor Docker container
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROCESSOR_DIR="$PROJECT_ROOT/processor"

# Default values
IMAGE_NAME="${IMAGE_NAME:-briefcast-processor}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-}"

usage() {
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --build       Build Docker image"
    echo "  --push        Push image to registry"
    echo "  --run         Run container locally"
    echo "  --all         Build, push, and run"
    echo "  --tag TAG     Image tag (default: latest)"
    echo "  --registry R  Registry URL (e.g., ghcr.io/username)"
    echo "  --help        Show this help"
    exit 0
}

build_image() {
    echo "🔨 Building Docker image..."
    cd "$PROCESSOR_DIR"

    # Install shared package deps first (for workspace)
    cd "$PROJECT_ROOT/shared"
    npm install
    npm run build

    cd "$PROCESSOR_DIR"
    npm install

    # Build TypeScript
    npm run build

    # Build Docker image
    docker build -t "$IMAGE_NAME:$IMAGE_TAG" .

    if [ -n "$REGISTRY" ]; then
        docker tag "$IMAGE_NAME:$IMAGE_TAG" "$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    fi

    echo "✅ Image built: $IMAGE_NAME:$IMAGE_TAG"
}

push_image() {
    if [ -z "$REGISTRY" ]; then
        echo "❌ Registry not specified. Use --registry option."
        exit 1
    fi

    echo "📤 Pushing image to $REGISTRY..."
    docker push "$REGISTRY/$IMAGE_NAME:$IMAGE_TAG"
    echo "✅ Image pushed!"
}

run_container() {
    echo "🏃 Running container locally..."

    # Check for .env file
    if [ ! -f "$PROCESSOR_DIR/.env" ]; then
        if [ -f "$PROCESSOR_DIR/.env.example" ]; then
            echo "⚠️  .env not found. Copy from example:"
            echo "   cp processor/.env.example processor/.env"
            echo "   Then edit with your credentials."
            exit 1
        fi
    fi

    cd "$PROCESSOR_DIR"
    docker-compose up --build
}

# Parse arguments
DO_BUILD=false
DO_PUSH=false
DO_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            DO_BUILD=true
            shift
            ;;
        --push)
            DO_PUSH=true
            shift
            ;;
        --run)
            DO_RUN=true
            shift
            ;;
        --all)
            DO_BUILD=true
            DO_PUSH=true
            DO_RUN=true
            shift
            ;;
        --tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        --registry)
            REGISTRY="$2"
            shift 2
            ;;
        --help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

# Default to build if no action specified
if ! $DO_BUILD && ! $DO_PUSH && ! $DO_RUN; then
    DO_BUILD=true
fi

# Execute actions
if $DO_BUILD; then
    build_image
fi

if $DO_PUSH; then
    push_image
fi

if $DO_RUN; then
    run_container
fi

echo ""
echo "🎉 Done!"
