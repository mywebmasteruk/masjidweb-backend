# Secret leak response (MasjidWeb backend)

Use this when GitGuardian, GitHub secret scanning, or `scripts/check-secrets.sh` reports a leaked credential.

## Immediate actions (do first)

### 1. Rotate Supabase service role key

Project: **ycode-masjidweb** (`jofgypmriaqphnsyxiks`)

1. Supabase Dashboard → **Project Settings** → **API**
2. Under **Project API keys**, rotate/regenerate the **service_role** key (or rotate JWT secret if that is your project’s only option — that invalidates **all** keys).
3. Copy the new **service_role** value only into secret stores (never git).

### 2. Update every runtime that used the old key

- Netlify **masjidweb-admin-v2**: `SUPABASE_SERVICE_ROLE_KEY` (production + any branch envs)
- Local `admin-dashboard-v2/.env` (if used)
- Any CI secrets or one-off scripts

Redeploy admin dashboard after Netlify env update (push to `main` or trigger deploy).

### 3. Remove secret from the repo

- Delete hardcoded literals from source files
- Run `bash scripts/check-secrets.sh` — must pass
- Commit and push the fix

### 4. Git history

The old key **remains in git history** until you rewrite history or Supabase rotates it. **Rotation is mandatory** even after the file is fixed.

Optional history purge (coordinate with team; rewrites all clones):

- Use [GitHub secret scanning remediation](https://docs.github.com/en/code-security/secret-scanning/working-with-secret-scanning-and-push-protection/working-with-push-protection-from-the-command-line) or `git filter-repo` / BFG
- Force-push only with explicit approval

## Prevention

- `bash scripts/check-secrets.sh` locally before commit
- `git config core.hooksPath .githooks` in this repo
- CI job **secret-scan** on every push/PR
- Cursor rule: `.cursor/rules/no-secrets-in-repo.mdc`

## Known leak (2026-05-21)

GitGuardian reported **Supabase service role JWT** in `publish-collections.mjs` (public repo). Fixed by env-based config; **rotate the key** even after merge.
