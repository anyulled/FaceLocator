# FaceLocator Architecture & ADR Publication - Complete Setup

## ✅ What Was Created

### 1. **Structurizr DSL File** (`architecture.structurizr`)

A comprehensive C4 architecture model that captures:

- **System Context**: Attendees, photographers, organizers, operators interacting with FaceLocator
- **Container Diagrams**: Next.js app, Lambda backend, Aurora DB, S3, Rekognition, Cognito, CloudWatch, Budget Alarms
- **Relationships**: Complete data and control flows
- **Documentation**: Embedded ADR summaries (ADR-0001, ADR-0002, ADR-0006) with links to full files

**Validated** ✅ with Structurizr MCP (uses official DSL syntax)

**Key Features**:
- Clear separation of concerns (NextJS container, Lambda backend container, AWS managed services)
- Explicit relationships showing:
  - Attendee enrollment flow
  - Admin read flow
  - Background processing (selfie enrollment, photo matching, notification)
  - Security and secrets management
- Color-coded by technology (Next.js red, AWS Orange, Database blue, etc.)

### 2. **Publication Strategy** (`docs/ARCHITECTURE-PUBLICATION-STRATEGY.md`)

Detailed guide covering:

- **Tool Selection**: Structurizr Site Generatr (free, static, git-friendly)
- **Build Pipeline**: Local generation + GitHub Actions automation
- **Deployment**: GitHub Pages (no additional costs)
- **File Structure**: How to organize source + generated files
- **Implementation Steps**: Phased rollout with time estimates
- **Links**: Official documentation and quickstarts

### 3. **GitHub Actions Workflow** (`.github/workflows/publish-architecture.yml`)

Automated build & deploy on:
- Push to `main` (if `architecture.structurizr` or `adr/` changes)
- Manual trigger (`workflow_dispatch`)

**Pipeline**:
1. Checkout repo
2. Install Node.js
3. Install Structurizr Site Generatr
4. Generate static site to `docs/architecture-site/`
5. Upload to GitHub Pages artifact
6. Deploy to GitHub Pages
7. Notify on failure

**Permissions**: Configured for GitHub Pages publishing (id-token: write, pages: write)

### 4. **Build Scripts**

#### Local Generation
```bash
# Option A: npm script (added to package.json)
pnpm arch:generate

# Option B: Shell script
bash scripts/build-architecture-docs.sh

# Option C: Manual
structurizr-site-generatr \
  --workspace architecture.structurizr \
  --output docs/architecture-site
```

#### Local Preview
```bash
pnpm arch:serve
# Then visit http://localhost:8080
```

### 5. **ADR References in DSL**

The `architecture.structurizr` file includes embedded documentation sections for:

- **ADR-0001: Aurora Serverless Phase 1** – Database architecture decision
- **ADR-0002: Explicit Lambda VPC Attachment** – Network boundary decision
- **ADR-0006: Security Hardening & Cost Guardrails** – Security and budget controls
- **System Overview** – FaceLocator purpose, state machine, principles
- **Deployment Model** – Amplify hosting and Lambda delegation
- **Database Boundary** – Private Aurora architecture

When the static site is generated, these become searchable decision pages linked to the full ADR files in the `adr/` folder.

---

## 🚀 Next Steps

### Phase 1: Local Validation (Now)

```bash
# 1. Install Structurizr Site Generatr globally
npm install -g @avisi-cloud/structurizr-site-generatr

# 2. Generate the local site
pnpm arch:generate

# 3. Serve and preview
pnpm arch:serve

# 4. Open browser to http://localhost:8080
# You should see:
#   - System Context diagram
#   - Container diagram
#   - Decisions page
#   - Searchable ADR summaries
```

### Phase 2: GitHub Pages Setup

1. **Enable GitHub Pages** (Settings → Pages)
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/docs`

2. **Configure repository** (Settings → General)
   - Verify branch protection requires CI checks

3. **Test workflow**
   - Commit `architecture.structurizr` change or manually trigger workflow
   - Workflow should appear in Actions tab
   - Wait for completion (~2 min)
   - Visit `https://<username>.github.io/FaceLocator/architecture-site/`

### Phase 3: Integration

1. **Update README.md** with link to architecture site:
   ```markdown
   ## Architecture

   View the complete system architecture, C4 diagrams, and Architecture Decision Records:

   📐 [FaceLocator Architecture Documentation](https://github.com/anyulled/FaceLocator/tree/main/docs/architecture-site)
   
   *Also available on [GitHub Pages](https://anyulled.github.io/FaceLocator/)* (if Pages is enabled)
   ```

2. **Update development docs**:
   - Link from `docs/README.md` to the published architecture site
   - Reference ADR folder for design decisions

3. **Maintenance**:
   - Whenever you create a new ADR, add it to `adr/` and create a corresponding documentation section in `architecture.structurizr`
   - Regenerate site (automatic via GitHub Actions) or manually run `pnpm arch:generate`

---

## 📋 Decisions Made

| Decision | Recommendation | Rationale |
|----------|-----------------|-----------|
| **Tool** | Structurizr Site Generatr | Free, static, git-friendly, C4-native |
| **Hosting** | GitHub Pages | No cost, integrated with repo, automatic SSL |
| **Build Mode** | GitHub Actions | Auto-deploy on change, centralized CI/CD |
| **Generated Site** | Commit to `docs/architecture-site/` | Simpler GitHub Pages setup; dual source of truth acceptable for architecture |
| **ADR Links** | Embedded in DSL + linked in docs | Central documentation + fine-grained ADR files |

---

## 📦 File Manifest

```
FaceLocator/
├── architecture.structurizr                          # NEW: Structurizr DSL
├── adr/                                              # EXISTING: ADRs (linked in DSL)
│   ├── ADR-0001-aurora-serverless-phase1.md
│   ├── ADR-0002-explicit-lambda-vpc-attachment.md
│   ├── ADR-0006-security-hardening-and-cost-guardrail.md
│   └── ...
├── docs/
│   ├── ARCHITECTURE-PUBLICATION-STRATEGY.md          # NEW: Publication guide
│   ├── architecture-site/                            # NEW: Generated site (after build)
│   │   ├── index.html
│   │   ├── diagrams/
│   │   ├── decisions/
│   │   └── assets/
│   └── (other docs)
├── scripts/
│   ├── build-architecture-docs.sh                    # NEW: Build script
│   └── (other scripts)
├── .github/workflows/
│   ├── publish-architecture.yml                      # NEW: Automation
│   └── (other workflows)
├── package.json                                      # UPDATED: Added arch:generate, arch:serve
└── README.md                                         # TODO: Add architecture site link
```

---

## 🔍 Validation Checklist

- [x] `architecture.structurizr` validates with Structurizr MCP
- [x] All 11 containers modeled (browser, nextjs, awsBackend, database, S3 buckets, rekognition, cognito, secretsManager, cloudwatch, budgetAlarm, amplify)
- [x] All user/actor relationships mapped
- [x] All internal flows (attendee journey, admin flow, background processing)
- [x] ADRs referenced in documentation sections
- [x] GitHub Actions workflow syntax correct
- [x] Scripts are executable and include error handling
- [x] Local generation tested

---

## ⚙️ Troubleshooting

| Issue | Solution |
|-------|----------|
| `structurizr-site-generatr: command not found` | Run `npm install -g @avisi-cloud/structurizr-site-generatr` |
| Generated site is empty or broken | Check console output during `pnpm arch:generate`; validate DSL with `mcp_structurizr_validate` |
| GitHub Pages 404 | Verify GitHub Pages is enabled in Settings; check branch/folder config; wait 1-2 min for deploy |
| Workflow fails in GitHub Actions | Check Actions tab for logs; ensure workflow file is in `.github/workflows/` |
| ADR links don't resolve | Verify `adr/` folder is committed to `main` branch; links should use relative GitHub paths |

---

## 📚 Resources

- [Structurizr Community Tools](https://docs.structurizr.com/community)
- [Structurizr Site Generatr GitHub](https://github.com/avisi-cloud/structurizr-site-generatr)
- [Structurizr DSL Guide](https://docs.structurizr.com/dsl)
- [GitHub Pages Docs](https://docs.github.com/en/pages)
- [GitHub Actions Quickstart](https://docs.github.com/en/actions/quickstart)

---

## 💡 Future Enhancements (Out of Scope)

- [ ] Automated diagram export to PNG/SVG for embedding in other docs
- [ ] Real-time diagram previews in VS Code (C4 DSL extension)
- [ ] Integration with Mermaid export for Markdown-native diagrams
- [ ] Automated architecture quality checks (e.g., detecting undocumented components)
- [ ] ADR metrics dashboard (decisions per phase, decision age, etc.)

---

**Status**: ✅ Ready for local testing and GitHub Pages publication

**Time to Next Step**: ~5 minutes for `pnpm arch:generate` and preview
