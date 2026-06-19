# Core update CTO bot (operator guide)

Plain-language guide for Ycode core updates without a human CTO (daily schedule while the pipeline is validated).

## What you do

1. Optional: click **Prepare safe update** (or wait for **daily 06:00 UTC** automatic run).
2. Read **email alerts** from MasjidWeb.
3. When Maintenance shows **green — Ready for you**, open the preview link, then click **Approve merge**.
4. If **red — Do not approve**, click **Run Premium AI Update**. Premium AI repairs the PR branch, runs tenant safety checks, and keeps approval locked until everything is green. Advanced details still include deterministic Autopilot, Copilot escalation, and copy-prompt options.

You never merge on GitHub yourself.

## What runs automatically

| Step | When |
|------|------|
| Daily prepare | 06:00 UTC every day |
| Autopilot classification | Every safe-update PR; writes LOW/MEDIUM/HIGH report and blocked reason |
| Premium AI repair | Primary red-state action from Admin Maintenance. Uses OpenRouter latest Claude frontier by default, applies safe unified diffs to the PR branch only, then runs tenant guards, type-check, build, and PR CI before approval can unlock. |
| Deterministic repair | Runs before Premium AI and remains available under Advanced details. Regenerates known mechanical conflicts such as `package-lock.json`; blocks high-risk tenant seams with an invariant report. |
| Autopilot guard | Fails if conflict markers or tenant-scope invariants are unsafe |
| Ready email | When CI turns green |
| Copilot escalation | Optional after deterministic repair blocks; creates a constrained PR comment/issue and can assign `@copilot` only when requested |
| Cursor escalation | When PR CI still fails after Autopilot repair |
| Approve email | When you click Approve merge |

## One-time setup

### Netlify (admin dashboard)

- `CORE_UPDATE_ALERT_EMAIL` — your inbox
- `RESEND_API_KEY` — from resend.com
- `CORE_UPDATE_EMAIL_FROM` — optional sender
- `CORE_UPDATE_NOTIFY_SECRET` — long random secret

### GitHub (`ycode-mw-tenant` repo)

- Variable `ADMIN_DASHBOARD_NOTIFY_URL` = `https://admin.masjidweb.com/api/updates/notify`
- Secret `CORE_UPDATE_NOTIFY_SECRET` — same value as Netlify
- Optional variable `ENABLE_COPILOT_ESCALATION=true` — when enabled, blocked Autopilot repair runs create/update a constrained PR comment for Copilot/developer handoff. To create an issue or assign `@copilot`, rerun `ai-repair-safe-update.yml` manually and set `copilot_escalation_mode` to `issue` or `assign`.

### Cursor Automation (cloud)

**MasjidWeb core update merge fix** — GitHub CI completed on `mywebmasteruk/ycode-mw-tenant`. Instructions: `ycode-mw-tenant/docs/CURSOR_CORE_UPDATE_ESCALATION.md`.

## Traffic lights

- **Green** — preview and approve
- **Amber** — wait (bot working or nothing needed)
- **Red** — do not approve

## Autopilot v2 messages

When Autopilot says **“blocked this update to protect tenant data”**, it found conflicts in tenant-sensitive files such as repositories, publish, auth, proxy, Supabase cookie/session, or collection item code. This is a safety stop, not a dashboard failure.

Use the buttons this way:

- **Run Premium AI Update** — primary red-state button. It asks the latest Claude frontier model through OpenRouter for strict patches, applies them only when they parse and pass tenant guards, and never approves or merges.
- **Advanced details → Retry deterministic Autopilot** — use when you specifically want only mechanical retry behavior such as lockfile regeneration.
- **Advanced details → Escalate to Copilot** — dispatches `Mechanical repair safe update PR` with `copilot_escalation_mode=issue`. It creates/updates a constrained GitHub issue/comment for Copilot or a developer. Use **Assign Copilot** only when GitHub Copilot coding agent is enabled for the repository. This never approves or merges.
- **Developer required** — use when Premium AI cannot return/apply a safe patch or tenant guards fail. A developer or Copilot-created draft PR must resolve the PR and run tenant-scope checks before approval.

## Revert to weekly

When confident in the pipeline, change `sync-upstream.yml` cron from `0 6 * * *` to `0 6 * * 1` (Mondays only).
