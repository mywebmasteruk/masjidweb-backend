# Core update CTO bot (operator guide)

Plain-language guide for Ycode core updates without a human CTO (daily schedule while the pipeline is validated).

## What you do

1. Optional: click **Prepare safe update** (or wait for **daily 06:00 UTC** automatic run).
2. Read **email alerts** from MasjidWeb.
3. When Maintenance shows **green — Ready for you**, open the preview link, then click **Approve merge**.
4. If **red — Do not approve**, wait for email or click **Run automated fix** once.

You never merge on GitHub yourself.

## What runs automatically

| Step | When |
|------|------|
| Daily prepare | 06:00 UTC every day |
| Mechanical repair | Auto after prepare when merge has conflicts; or Run automated fix |
| Ready email | When CI turns green |
| Cursor escalation | When PR CI still fails after mechanical repair |
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

## Revert to weekly

When confident in the pipeline, change `sync-upstream.yml` cron from `0 6 * * *` to `0 6 * * 1` (Mondays only).
