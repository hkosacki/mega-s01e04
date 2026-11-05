---
name: preview-upload
description: Put a static HTML preview file on Cloudflare Pages under a public HTTPS link, overwrite it later, or take it down.
---

# preview-upload

Uploads a single static HTML file (placed as `index.html` inside a temporary folder) to Cloudflare Pages with `npx wrangler`, overwrites the same `https://<project>.pages.dev` link, or deletes the project.

## Routine

Run all `wrangler` commands from `/tmp` (a directory with no `wrangler.json`, `wrangler.jsonc`, or `wrangler.toml` in it or above it).

1. **Create project (once):**
   ```sh
   cd /tmp && npx wrangler pages project create <project-name> --production-branch main --force
   ```

2. **Put / overwrite preview (`https://<project-name>.pages.dev/`):**
   ```sh
   cd /tmp && npx wrangler pages deploy <dir-with-index-html> --project-name <project-name> --branch main --commit-dirty=true
   ```

3. **Take down:**
   ```sh
   cd /tmp && npx wrangler pages project delete <project-name> --yes
   ```
