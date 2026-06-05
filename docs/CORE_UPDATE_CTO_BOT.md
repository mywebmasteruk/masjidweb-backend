# Core update CTO bot (operator guide)

Plain-language guide for weekly Ycode core updates without a human CTO.

## What you do

1. Optional: click **Prepare safe update** (or wait for **Monday 06:00 UTC** automatic run).
2. Read **email alerts** from MasjidWeb.
3. When Maintenance shows **green — Ready for you**, open the preview link, then click **Approve merge**.
4. If **red — Do not approve**, wait for email or click **Run automated fix** once.

You never merge on GitHub yourself.

## What runs automatically

| Step | When |
|------|------|
| Weekly prepare | Mondays 06:00 UTC |
| Mechanical repair | After prepare, or when you click Run automated fix |
| Ready email | When CI turns green |
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

In Cursor → Automations, create a cloud agent that runs when safe-update GitHub workflows fail. Point it at `ycode-mw-tenant` and `masjidweb-core-seams.md`. Mechanical fixes only; never weaken tenant isolation.

## Traffic lights

- **Green** — preview and approve
- **Amber** — wait (bot working or nothing needed)
- **Red** — do not approve
