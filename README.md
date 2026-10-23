# dhara

Video hosting for coaching centers and educators in Bangladesh - upload once, stream from the edge, keep it on your website, priced in taka.

## Run it locally (V1)

```bash
bin/setup   # once: deps, database, tusd, encoder build, secrets
bin/dev     # everything: http://localhost:5173
```

Logs are in `var/log/`. Make yourself a super-admin:

```bash
backend/.venv/bin/python backend/manage.py shell -c "from administrator.models import User; User.objects.filter(email='YOU@gmail.com').update(is_staff=True)"
```

### Google Sign-In

1. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → **Web application**.
2. Authorized JavaScript origins: `http://localhost:5173` (and `http://localhost`).
3. Put the client ID in `backend/.env` as `GOOGLE_CLIENT_ID=…` and restart `bin/dev`.

Until then, the login page shows a **local development sign-in** (only when `DEBUG` and `DEV_LOGIN_ENABLED` are on).

See `CLAUDE.md` for the code layout and conventions, `docs/PLAN.md` for the architecture, and `docs/V1-NOTES.md` for what V1 covers.
