# Core update CTO bot (operator guide)

Plain-language guide for Ycode core updates without a human CTO (daily schedule while the pipeline is validated).

## What you do

1. Optional: click **Prepare safe update** (or wait for **daily 06:00 UTC** automatic run).
2. Read **email alerts** from MasjidWeb.
3. When Maintenance shows **green — Ready for you**, open the preview link, then click **Approve merge**.
4. If **red — Do not approve**, read the Autopilot reason. Click **Retry Autopilot** once for deterministic fixes such as lockfile regeneration, choose **Defer Update**, or ask a developer when it says tenant data is protected.

You never merge on GitHub yourself.

## What runs automatically

| Step | When |
|------|------|
| Daily prepare | 06:00 UTC every day |
| Autopilot classification | Every safe-update PR; writes LOW/MEDIUM/HIGH report and blocked reason |
| Deterministic repair | Auto after prepare when merge has conflicts; or Retry Autopilot. Regenerates known mechanical conflicts such as `package-lock.json`; blocks high-risk tenant seams with an invariant report. |
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

- **Retry Autopilot** — safe once when lockfiles or known deterministic checks may clear. Autopilot v2.2 uploads a repair report showing fixed files, blocked files, reason groups (`known resolver unavailable`, `tenant invariant failed`, `conflict markers remain`), and the next developer action. For `lib/page-fetcher.ts` and `lib/services/collectionService.ts`, v2.2 explains the exact missing tenant invariant instead of generic blocking.
- **Escalate to Copilot** — click the Admin Maintenance button to dispatch `Mechanical repair safe update PR` with `copilot_escalation_mode=issue`. It creates/updates a constrained GitHub issue/comment for Copilot or a developer. Use **Assign Copilot** only when GitHub Copilot coding agent is enabled for the repository. This never approves or merges.
- **Defer Update** — use when you do not need the update today.
- **Developer required** — use when Autopilot names tenant-sensitive conflicts. A developer or Copilot-created draft PR must resolve the PR and run tenant-scope checks before approval.

## Revert to weekly

When confident in the pipeline, change `sync-upstream.yml` cron from `0 6 * * *` to `0 6 * * 1` (Mondays only).
