# Deploying the Knowledge Graph

These scripts provision a fresh Knowledge Graph instance on an Ubuntu droplet.
Each droplet keeps its own data — the SQLite DB, markdown files, and uploaded
PDFs all live under `/srv/kg/data/`, which is `.gitignore`d and never touched
by the deploy scripts. Two droplets running this code share no state.

> **Heads-up:** the app currently allows anonymous create/edit/delete with
> only a honeypot field for spam protection. Don't expose a public URL until
> you've added rate limiting.

## Contents of this directory

| File | Purpose |
|---|---|
| `setup.sh` | One-time install on a fresh droplet (packages, Node 20, swap, service user, clone, build, systemd, nginx, ufw) |
| `update.sh` | Pull latest, `npm ci`, `npm run build`, restart the service |
| `backup.sh` | Tar `data/` into `/var/backups/kg/`, prune older than 14 days |
| `kg.service` | systemd unit (binds Node to localhost:3000) |
| `nginx.conf` | reverse-proxy config (HTTP, port 80) |

## Prerequisites

- A DigitalOcean droplet (or any Ubuntu 22.04 / 24.04 host) with at least 1 GB RAM
- The repo pushed to GitHub (the scripts assume `git clone` works)
- Your SSH public key on the droplet (added at provisioning, or copied manually)

---

## First-time deploy

### 1. Create the droplet

In the DigitalOcean control panel → **Create → Droplets**:

- **Image:** Ubuntu 24.04 LTS
- **Plan:** Basic Regular SSD, **1 GB / 1 CPU / 25 GB** ($6/mo) — sufficient. The build process needs ~2 GB peak; `setup.sh` auto-creates a 2 GB swap file on droplets with less than 2 GB RAM.
- **Region:** closest to your users
- **Authentication:** add your SSH public key
- **Hostname:** anything, e.g. `kg-staging` or `kg-prod`

Wait for it to boot, note the public IP.

### 2. Create a non-root sudo user

Don't run the app as root.

```bash
ssh root@<droplet-ip>

# Inside the droplet:
adduser dave                   # name it whatever
usermod -aG sudo dave
rsync --archive --chown=dave:dave ~/.ssh /home/dave/
exit
```

From now on connect as `ssh dave@<droplet-ip>`.

### 3. Pull down the deploy scripts

```bash
ssh dave@<droplet-ip>
git clone https://github.com/YOUR_USER/YOUR_REPO.git /tmp/kg-bootstrap
cd /tmp/kg-bootstrap
```

(Public HTTPS clone here is fine even if the actual `setup.sh` will use the SSH
URL — we just need the scripts on the droplet to bootstrap.)

### 4. Run setup.sh

Substitute the URL you want the `kg` service user to use for ongoing pulls.

**Public repo (HTTPS, no auth):**

```bash
REPO=https://github.com/YOUR_USER/YOUR_REPO.git ./deploy/setup.sh
```

**Private repo (SSH + deploy key):**

```bash
REPO=git@github.com:YOUR_USER/YOUR_REPO.git ./deploy/setup.sh
```

If you used an SSH URL on a private repo, the first run will:

1. Generate an SSH key for the `kg` service user
2. Pre-trust GitHub's host key
3. Test auth — it will fail the first time because the new key isn't on GitHub yet
4. Print a clear "add this key as a Deploy Key at <URL>" message with the public key

Open the URL it printed, paste the public key, give it a name (e.g. `kg-droplet`),
leave "Allow write access" **unchecked** (read-only is enough), save. Then
re-run the same `REPO=… ./deploy/setup.sh` command. The clone will succeed.

What `setup.sh` does in full:

- Installs `curl`, `git`, `nginx`, `ufw`, `build-essential`, `python3`, Node.js 20
- Creates a 2 GB swap file if the droplet has less than 2 GB RAM and no swap
- Creates a `kg` system user with `/home/kg/`
- Clones the repo to `/srv/kg`, runs `npm ci && npm run build` as `kg`
- Installs `deploy/kg.service` to `/etc/systemd/system/` and starts it
- Installs `deploy/nginx.conf` to `/etc/nginx/sites-available/kg`, symlinks it enabled, removes the default site, reloads nginx
- Opens ufw ports 22 (SSH) and 80 (HTTP), enables the firewall

It's idempotent — safe to re-run if any step fails halfway. If the nginx config
already has SSL bits (added later by certbot), it won't be overwritten.

### 5. Verify

```bash
sudo systemctl status kg          # active (running)
curl -I http://localhost/         # HTTP/1.1 200 OK from nginx
```

Then from a browser hit `http://<droplet-ip>/` and you should see the empty
home page.

---

## Routine operations

### Deploy new code

```bash
# After pushing commits to GitHub
ssh dave@<droplet-ip>
sudo /srv/kg/deploy/update.sh
```

This pulls the repo as the `kg` user, runs `npm ci` + `npm run build`, then
restarts the systemd service. `data/` is never touched.

### Live logs

```bash
sudo journalctl -u kg -f
```

### Restart the Node process

```bash
sudo systemctl restart kg
```

Data persists across restarts — only the running process is replaced.

### Reload nginx

```bash
sudo systemctl reload nginx
```

### Take a backup now

```bash
sudo /srv/kg/deploy/backup.sh
```

Output goes to `/var/backups/kg/kg-YYYYMMDD-HHMMSS.tar.gz`.

---

## Schedule daily backups

```bash
sudo crontab -e
```

Add:

```
0 3 * * * /srv/kg/deploy/backup.sh >> /var/log/kg-backup.log 2>&1
```

Backups land in `/var/backups/kg/`, kept for 14 days, rotation handled by the
script. These live on the same droplet — if the droplet is destroyed, the
backups die with it. For off-droplet safety, also rsync them somewhere else or
use `rclone` to push to DigitalOcean Spaces.

---

## Per-deployment branding

Set the page title and description per-instance via the env file:

```bash
sudo install -m 600 -o kg -g kg /dev/null /etc/kg.env  # if not yet created
sudo tee -a /etc/kg.env > /dev/null <<'EOF'
SITE_TITLE=My Knowledge Graph
SITE_DESCRIPTION=Notes & questions for the foo project.
EOF
sudo systemctl restart kg
```

Both fall back to the defaults (`Knowledge Graph` / its blurb) when unset.
This affects:
- the browser tab title
- the `<h1>` on the home page and login page
- the title of the Quarto export bundle (`_quarto.yml`) and its index page

## Password-gating the site (keep bots out)

Set a single shared `SITE_PASSWORD` and the whole site (every page + every
`/api/*` endpoint) requires that password. Unset → no gate (current behaviour).

```bash
# On the droplet
sudo install -m 600 -o kg -g kg /dev/null /etc/kg.env
sudo tee /etc/kg.env > /dev/null <<'EOF'
SITE_PASSWORD=replace-me-with-a-real-passphrase
EOF
sudo systemctl restart kg
```

Visit any URL → redirected to `/login`. Enter the password → `kg_auth` cookie
gets set for 30 days, you're through. `/api/*` calls without the cookie get a
clean `401`.

To rotate or remove the password:

```bash
sudo $EDITOR /etc/kg.env   # change SITE_PASSWORD=... (or delete the line)
sudo systemctl restart kg
```

Existing user cookies stop working as soon as `SITE_PASSWORD` changes (the
cookie value is `sha256(password)`, so a different password = a different
expected cookie = forced re-login).

## Adding HTTPS to an instance

You need a domain or subdomain (Let's Encrypt won't issue certs for raw IPs).

### 1. Point DNS at the droplet

At your DNS provider, add an **A record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `your-subdomain` (or `@` for apex) | `<droplet-ip>` | 300 |

Verify: `dig +short your.domain.com` should return the droplet IP.

### 2. Get the certificate

```bash
ssh dave@<droplet-ip>

# Install certbot if needed
sudo apt-get install -y certbot python3-certbot-nginx

# Tell nginx about the new hostname
sudo sed -i 's/server_name _;/server_name your.domain.com;/' /etc/nginx/sites-available/kg
sudo nginx -t && sudo systemctl reload nginx

# Get the cert (run AFTER dig confirms DNS is correct)
sudo certbot --nginx -d your.domain.com

# Open HTTPS
sudo ufw allow 443/tcp
```

certbot will prompt for an email and ask whether to redirect HTTP→HTTPS (say
yes). Auto-renewal runs every 12 hours via the `certbot.timer` systemd unit.

---

## Running multiple instances on one droplet

You can host several independent graphs on a single droplet. The code is shared
(one checkout in `/srv/kg`, built once); only the **data dir**, **env file**,
and **hostname** differ per instance. There is still no shared state between
instances — separate SQLite DBs, separate files, separate processes.

### Layout

```
/srv/kg/                  ← single git clone: code + node_modules + .next build
/srv/kg-data/<name>/      ← per-instance data (app.db, nodes/, uploads/)
/etc/kg/<name>.env        ← per-instance env (PORT, KG_DATA_DIR, SITE_TITLE, SITE_PASSWORD…)
```

Instances run under the systemd **template unit** `kg@.service`, so `kg@alpha`
serves the `alpha` instance, `kg@beta` serves `beta`, etc. Each is its own Node
process on its own port — a crash in one only restarts that one.

### Add an instance

One command does data dir + env file + service + nginx vhost:

```bash
# sudo ./deploy/new-instance.sh <name> <port> [server_name]
sudo /srv/kg/deploy/new-instance.sh alpha 3001 alpha.example.org
sudo /srv/kg/deploy/new-instance.sh beta  3002 beta.example.org
```

Pick a distinct port per instance (3001, 3002, …). Then enable HTTPS for each
host (printed at the end of the script):

```bash
sudo certbot --nginx -d alpha.example.org
```

Tip: a wildcard DNS record (`*.example.org → droplet IP`) means new instances
need no DNS change — only the nginx vhost the script writes, plus certbot.

After creating an instance, edit its config any time:

```bash
sudo $EDITOR /etc/kg/alpha.env   # SITE_TITLE, SITE_DESCRIPTION, SITE_PASSWORD…
sudo systemctl restart kg@alpha
```

### Per-instance operations

| Task | Command |
|---|---|
| Status | `sudo systemctl status kg@alpha` |
| Logs | `sudo journalctl -u kg@alpha -f` |
| Restart | `sudo systemctl restart kg@alpha` |
| Stop / disable | `sudo systemctl disable --now kg@alpha` |

### Deploying code to all instances

`update.sh` pulls + builds once and restarts the default service **and** every
`kg@*` instance:

```bash
sudo /srv/kg/deploy/update.sh
```

### Backups

`backup.sh` snapshots every data dir it finds — the legacy `/srv/kg/data`
(reported as `default`) and each `/srv/kg-data/<name>/` — into its own tarball
under `/var/backups/kg/`. The daily cron from earlier needs no change.

### Relationship to the original single-droplet setup

Nothing about the original layout changes: with no `KG_DATA_DIR` set, the app
defaults to `<cwd>/data` and the standalone `kg.service` keeps serving
`/srv/kg/data` on port 3000 exactly as before. The template unit is purely
additive — adopt it for new graphs, or migrate the existing one by moving its
data into `/srv/kg-data/default` and running `new-instance.sh default 3000`.

### Copying data between instances (e.g. promote staging → prod)

```bash
sudo /srv/kg/deploy/backup.sh                       # writes kg-<name>-<ts>.tar.gz
sudo systemctl stop kg@dest
sudo rm -rf /srv/kg-data/dest && sudo mkdir -p /srv/kg-data/dest
sudo tar -xzf /var/backups/kg/kg-src-<ts>.tar.gz -C /tmp
sudo mv /tmp/src/* /srv/kg-data/dest/            # tarball unpacks to the source dir name
sudo chown -R kg:kg /srv/kg-data/dest
sudo systemctl start kg@dest
```

### When to use separate droplets instead

One droplet per graph is still the right call if you need hard failure
isolation (one box dying must not take the others down), strict security
separation between graphs, or wildly different traffic profiles. The
multi-instance model trades some of that isolation for far less to manage
(one IP, one nginx, one OS, one build).

---

## Troubleshooting

**`npm ci` is "Killed" during install.** Out of memory — swap didn't take effect.
Verify with `free -h`. If swap shows `0B`, manually create it:
```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && \
sudo mkswap /swapfile && sudo swapon /swapfile && \
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

**`Permission denied (publickey)` cloning from GitHub.** The `kg` user's SSH
key isn't registered as a deploy key on the repo. Re-run `setup.sh` and follow
the printed instructions, or manually:
```bash
sudo cat /home/kg/.ssh/id_ed25519.pub
# Paste at https://github.com/YOUR_USER/YOUR_REPO/settings/keys/new
```

**Build fails with TypeScript error about a missing type declaration.** The
production build does full type checking and is stricter than `npm run dev`.
If you've added a new untyped package, add a shim at
`src/types/PKG_NAME.d.ts` containing `declare module 'PKG_NAME';`.

**`Module not found: Can't resolve 'fs'` after editing a client component.**
A `'use client'` component is importing something from the server-only lib
(`src/lib/db.ts`, `src/lib/nodes.ts`). Import types only via
`import type { … } from …`, or move shared helpers into `src/lib/node-types.ts`
which has no server-only dependencies.

**`Object.defineProperty called on non-object`** during SSR of a page that
uses a browser-only library. Wrap the offending component in
`next/dynamic` with `ssr: false` (see `src/components/PdfPreview.tsx` for
the pattern).

**Service won't start, `Unit kg.service could not be found`.** `setup.sh` died
before reaching the systemd install step. Re-run it; it's idempotent.

**Pre-existing nginx site interferes.** `setup.sh` removes
`/etc/nginx/sites-enabled/default` once. If you've got other custom sites,
edit `/etc/nginx/sites-available/kg` to give it a non-wildcard `server_name`
matching the domain you want it to handle.
