#!/bin/bash
# Architecture Documentation Build & Serve Script

set -e

echo "🏗️  Building FaceLocator architecture documentation..."

# Check if Structurizr Site Generatr is installed
if ! command -v structurizr-site-generatr &> /dev/null; then
    echo "📦 Installing Structurizr Site Generatr..."
    npm install -g @avisi-cloud/structurizr-site-generatr
fi

# Generate the static site
echo "🎨 Generating Structurizr site from architecture.structurizr..."
structurizr-site-generatr \
    --workspace architecture.structurizr \
    --output docs/architecture-site

echo "✅ Architecture site generated successfully!"
echo ""
echo "📍 Site location: docs/architecture-site/"
echo ""
echo "To serve locally, run:"
echo "  cd docs/architecture-site && npx http-server -p 8080"
echo ""
echo "Then visit: http://localhost:8080"
