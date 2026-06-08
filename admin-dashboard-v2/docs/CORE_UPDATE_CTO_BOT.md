# Core update CTO bot (operator guide)

Plain-language guide for running weekly Ycode core updates **without a human CTO**.

## What you do

1. **Optional:** click **Prepare safe update** any time (or wait for **Monday 06:00 UTC** automatic run).
2. **Read emails** from MasjidWeb updates.
3. When the dashboard shows **green — Ready for you**, open the **preview link**, then click **Approve merge**.
4. If **red — Do not approve**, wait for another email or click **Run automated fix** once.

You never merge code on GitHub yourself.

## What the bot does

| Step | System |
|------|--------|
| Weekly prepare | GitHub `Create safe Ycode update PR` (Mondays) |
| Mechanical repair | GitHub `Mechanical repair safe update PR` (rerere + lockfile) |
| Operator follow-up | GitHub `Core update operator` after each prepare |
| Ready email | GitHub `Core update notify ready` when CI is green |
| Escalation | Cursor Automation (cloud) when repair/CI fails — optional |

## One-time setup

### Admin dashboard (Netlify env)

| Variable | Purpose |
|----------|---------|
| `CORE_UPDATE_ALERT_EMAIL` | Your inbox for alerts |
| `RESEND_API_KEY` | Resend API key |
| `CORE_UPDATE_EMAIL_FROM` | Optional sender |
| `CORE_UPDATE_NOTIFY_SECRET` | Shared secret for GitHub → admin notify API |

### Builder repo (`ycode-mw-tenant` GitHub)

| Variable | Purpose |
|----------|---------|
| `ADMIN_DASHBOARD_NOTIFY_URL` | `https://admin.masjidweb.com/api/updates/notify` |
| `ADMIN_DASHBOARD_ISOLATION_LOG_URL` | `https://admin.masjidweb.com/api/isolation-check-log` (daily isolation history) |
| `CORE_UPDATE_NOTIFY_SECRET` | Same as Netlify |

### Cursor Automation (cloud)

Create in **Cursor → Automations** with cloud runtime. Trigger on failed safe-update workflows; instructions in `ycode-mw-tenant/docs/masjidweb-core-seams.md`.

## Traffic lights

| Light | Meaning |
|-------|---------|
| **Green** | Safe to preview and approve |
| **Amber** | Working or idle — wait |
| **Red** | Do not approve |
