#!/bin/bash
# Architecture Documentation Build & Serve Script

set -e

echo "🏗️  Building FaceLocator architecture documentation..."

# Check if Structurizr Site Generatr is installed
if ! command -v structurizr-site-generatr &> /dev/null; then
    # Check for Docker
    if command -v docker &> /dev/null; then
        echo "📦 Using Docker to generate site (no local installation needed)..."
        docker run -it --rm \
            -v "$PWD":/var/model \
            ghcr.io/avisi-cloud/structurizr-site-generatr:latest \
            generate-site \
            --workspace-file architecture.structurizr \
            --output-dir /var/model/build
        mv build docs/architecture-site
    else
        echo "❌ Docker not found. Install Docker or use Homebrew:"
        echo "   brew tap avisi-cloud/tools && brew install structurizr-site-generatr"
        exit 1
    fi
else
    # Generate the static site using installed tool
    echo "🎨 Generating Structurizr site from architecture.structurizr..."
    structurizr-site-generatr generate-site \
        --workspace-file architecture.structurizr \
        --output docs/architecture-site
fi

echo "✅ Architecture site generated successfully!"
echo ""
echo "📍 Site location: docs/architecture-site/"
echo ""
echo "To serve locally, run:"
echo "  cd docs/architecture-site && npx http-server -p 8080"
echo ""
echo "Then visit: http://localhost:8080"
