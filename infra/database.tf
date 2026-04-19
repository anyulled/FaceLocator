# The POC keeps database provisioning intentionally minimal. A concrete
# PostgreSQL instance may be introduced later, but the runtime boundary,
# credentials source, and schema bootstrap path are fixed here so the Next.js
# app and worker Lambdas have a stable contract now.
