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

### Cursor Automation (cloud)

**MasjidWeb core update merge fix** — GitHub CI completed on `mywebmasteruk/ycode-mw-tenant`. Instructions: `ycode-mw-tenant/docs/CURSOR_CORE_UPDATE_ESCALATION.md`.

## Traffic lights

- **Green** — preview and approve
- **Amber** — wait (bot working or nothing needed)
- **Red** — do not approve

## Autopilot v2 messages

When Autopilot says **“blocked this update to protect tenant data”**, it found conflicts in tenant-sensitive files such as repositories, publish, auth, proxy, Supabase cookie/session, or collection item code. This is a safety stop, not a dashboard failure.

Use the buttons this way:

- **Retry Autopilot** — safe once when lockfiles or known deterministic fixes may clear. Autopilot v2.1 uploads a repair report showing repaired files and any blocked tenant invariants.
- **Defer Update** — use when you do not need the update today.
- **Developer required** — use when Autopilot names tenant-sensitive conflicts. A developer must resolve the PR and run tenant-scope checks before approval.

## Revert to weekly

When confident in the pipeline, change `sync-upstream.yml` cron from `0 6 * * *` to `0 6 * * 1` (Mondays only).
