# Architecture & ADR Publication Strategy

## Goal

Publish FaceLocator's Structurizr architecture diagrams and Architecture Decision Records (ADRs) to GitHub Pages for transparent, searchable architecture documentation.

## Approach

### 1. **Static Site Generation**

Use **Structurizr Site Generatr** to convert the DSL workspace + ADRs into a self-contained static HTML site.

- **Pros**:
  - No external service required (pure static files)
  - Git-friendly (source + output both version-controlled)
  - Works offline
  - SEO-friendly
  - Free hosting on GitHub Pages
  
- **Cons**:
  - Requires build step before deploy
  - Regenerate on every ADR or DSL change

### 2. **Build & Deploy Workflow**

#### Local Development

**Option A: Docker** (Recommended — fastest, no local dependencies)

```bash
# Generate static site using Docker
docker run -it --rm \
  -v "$PWD":/var/model \
  ghcr.io/avisi-cloud/structurizr-site-generatr:latest \
  generate-site \
  --workspace-file architecture.structurizr \
  --output-dir build

# Move to docs folder for serving
mv build docs/architecture-site

# Preview locally
cd docs/architecture-site && npx http-server -p 8080
```

**Option B: Homebrew** (macOS native, first-time install takes ~5-10 min)

```bash
# Install via Homebrew (one-time, may take several minutes)
brew tap avisi-cloud/tools
brew install structurizr-site-generatr

# Generate static site
structurizr-site-generatr generate-site \
  --workspace-file architecture.structurizr \
  --output docs/architecture-site

# Preview locally
cd docs/architecture-site && npx http-server -p 8080
```

#### GitHub Actions Pipeline

Auto-generate and deploy on:

- Merge to `main` (ADR or DSL changes)
- Manual workflow trigger

Files:

- `.github/workflows/publish-architecture.yml` (build + deploy)

#### GitHub Pages Configuration

- **Source branch**: `main`
- **Source directory**: `docs/architecture-site` (or `docs/` if using Jekyll default)
- **Domain**: `https://<username>.github.io/FaceLocator/` (or custom domain)

### 3. **File Structure**

```text
FaceLocator/
├── architecture.structurizr           # Source (versioned)
├── adr/                              # Source (versioned)
│   ├── ADR-0001-*.md
│   ├── ADR-0002-*.md
│   └── ...
├── docs/
│   ├── architecture-site/            # Generated (check in or .gitignore?)
│   │   ├── index.html
│   │   ├── diagrams/
│   │   ├── decisions/
│   │   └── assets/
│   └── (other docs)
└── .github/workflows/
    └── publish-architecture.yml       # Automation
```

**Decision**: Should `docs/architecture-site/` be version-controlled?

- **Option A (Recommended)**: Commit generated site
  - Pros: GitHub Pages can serve directly; no CI/CD to troubleshoot
  - Cons: Duplicated content in repo
  
- **Option B**: Generate on-the-fly in CI
  - Pros: Cleaner repo; single source of truth
  - Cons: Requires GitHub Actions on every publish

### 4. **Referencing ADRs in Structurizr**

Current approach in `architecture.structurizr`:

```text
documentation {
    section "ADR-0001: Aurora Serverless Phase 1" {
        title "ADR-0001: Adopt Aurora PostgreSQL Serverless v2"
        content """
            ... summary ...
            See: adr/ADR-0001-aurora-serverless-phase1.md
        """
    }
}
```

Site Generatr will:

1. Extract decision sections
2. Generate a "Decisions" page
3. Optionally link back to `adr/` folder (if accessible on GitHub Pages)

### 5. **Site Generatr Features**

✅ Supported:

- C4 diagrams (rendered from DSL)
- Embedded documentation
- Decision records as searchable pages
- Responsive design
- Dark mode

❌ Not supported:

- Interactive diagram editing (read-only)
- Real-time updates (regenerate on change)

## Implementation Steps

### Phase 1: Local Setup (This Session)

1. ✅ Create `architecture.structurizr` DSL
2. ✅ Validate with Structurizr MCP
3. ✅ Reference ADRs in documentation sections
4. ⏳ Install Structurizr Site Generatr
5. ⏳ Generate local site
6. ⏳ Preview in browser

### Phase 2: GitHub Actions Automation

1. Create `.github/workflows/publish-architecture.yml`
2. Configure GitHub Pages settings
3. Test publish on merge to `main`

### Phase 3: Documentation & Maintenance

1. Link from README.md to published site
2. Update docs when ADRs change
3. Regenerate site (manual or auto)

## Estimate

| Task | Effort | Blocking |
| ---- | ------ | -------- |
| Install + local generation | 5 min | No |
| GitHub Actions setup | 15 min | No |
| GitHub Pages config | 5 min | No |
| **Total** | **25 min** | No |

## Links

- [Structurizr Site Generatr Docs](https://github.com/avisi-cloud/structurizr-site-generatr)
- [GitHub Pages Quickstart](https://docs.github.com/en/pages/getting-started-with-github-pages)
- [Structurizr DSL Docs](https://docs.structurizr.com/dsl)

## Next Actions

1. Install Structurizr Site Generatr
2. Generate local site from `architecture.structurizr`
3. Preview and iterate
4. Create GitHub Actions workflow
5. Deploy to GitHub Pages
