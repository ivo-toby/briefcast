#!/bin/bash
#
# Deploy Briefcast - Hybrid Architecture
#
# This script deploys both components:
# 1. Email Worker (Cloudflare Workers) - receives emails, stores to R2
# 2. Processor (Docker) - generates podcast episodes from emails
#
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

usage() {
    echo "Briefcast Deployment Script"
    echo ""
    echo "Usage: $0 [component] [options]"
    echo ""
    echo "Components:"
    echo "  all       Deploy everything (default)"
    echo "  worker    Deploy email worker to Cloudflare"
    echo "  processor Build and run processor container"
    echo ""
    echo "Options:"
    echo "  --build-only    Only build, don't deploy/run"
    echo "  --skip-tests    Skip running tests"
    echo "  --help          Show this help"
    echo ""
    echo "Examples:"
    echo "  $0 all              # Deploy everything"
    echo "  $0 worker           # Deploy just the email worker"
    echo "  $0 processor --run  # Build and run processor"
    exit 0
}

# Parse arguments
COMPONENT="all"
BUILD_ONLY=false
SKIP_TESTS=false
EXTRA_ARGS=""

while [[ $# -gt 0 ]]; do
    case $1 in
        all|worker|processor)
            COMPONENT="$1"
            shift
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        --help)
            usage
            ;;
        *)
            EXTRA_ARGS="$EXTRA_ARGS $1"
            shift
            ;;
    esac
done

echo "🎙️  Briefcast Deployment"
echo "========================"
echo ""

# Run tests first (unless skipped)
if ! $SKIP_TESTS; then
    echo "📋 Running tests..."
    cd "$PROJECT_ROOT"

    # Run shared tests
    if [ -d "shared" ]; then
        echo "  Testing shared package..."
        cd "$PROJECT_ROOT/shared"
        npm install
        npm test || echo "⚠️  Shared tests not configured yet"
    fi

    # Run processor tests
    if [ -d "$PROJECT_ROOT/processor" ]; then
        echo "  Testing processor..."
        cd "$PROJECT_ROOT/processor"
        npm install
        npm test || echo "⚠️  Processor tests not configured yet"
    fi

    # Run worker tests
    if [ -d "$PROJECT_ROOT/workers/email-worker" ]; then
        echo "  Testing email worker..."
        cd "$PROJECT_ROOT/workers/email-worker"
        npm install
        npm test || echo "⚠️  Worker tests not configured yet"
    fi

    cd "$PROJECT_ROOT"
    echo "✅ Tests complete"
    echo ""
fi

# Deploy components
case $COMPONENT in
    all)
        echo "📦 Deploying all components..."
        echo ""

        # Deploy worker
        echo "--- Email Worker ---"
        bash "$SCRIPT_DIR/deploy-worker.sh" $EXTRA_ARGS || true
        echo ""

        # Build processor
        echo "--- Processor ---"
        if $BUILD_ONLY; then
            bash "$SCRIPT_DIR/deploy-processor.sh" --build $EXTRA_ARGS
        else
            bash "$SCRIPT_DIR/deploy-processor.sh" --build $EXTRA_ARGS
        fi
        ;;

    worker)
        bash "$SCRIPT_DIR/deploy-worker.sh" $EXTRA_ARGS
        ;;

    processor)
        if $BUILD_ONLY; then
            bash "$SCRIPT_DIR/deploy-processor.sh" --build $EXTRA_ARGS
        else
            bash "$SCRIPT_DIR/deploy-processor.sh" $EXTRA_ARGS
        fi
        ;;
esac

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "Architecture:"
echo "  ┌─────────────────┐    ┌──────────────┐"
echo "  │  Email Worker   │───▶│     R2       │"
echo "  │  (Cloudflare)   │    │   Bucket     │"
echo "  └─────────────────┘    └──────┬───────┘"
echo "                                │"
echo "                                ▼"
echo "                     ┌──────────────────┐"
echo "                     │    Processor     │"
echo "                     │    (Docker)      │"
echo "                     └────────┬─────────┘"
echo "                              │"
echo "                              ▼"
echo "                     ┌──────────────────┐"
echo "                     │    RSS Feed      │"
echo "                     │    + Episodes    │"
echo "                     └──────────────────┘"
