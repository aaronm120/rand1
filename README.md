Here's the full deployment flow:

## 1. Get the files onto the server

```bash
# Option A — SCP from your machine
scp -r ./randolph-portal user@your-server:/opt/randolph-portal

# Option B — Git (if you push to a repo)
git clone https://github.com/you/randolph-portal /opt/randolph-portal
```

## 2. Run the setup script

```bash
cd /opt/randolph-portal
chmod +x setup.sh
sudo ./setup.sh
```

This installs Node.js 20, build tools, PM2, project dependencies, creates `.env` with a generated JWT secret, and creates the `data/`, `uploads/`, `logs/` directories.

## 3. Edit `.env` if needed

```bash
nano .env
# Change PORT if 3000 conflicts
# Add SMTP credentials now, or do it later via Admin Panel → Settings
```

## 4. Start the app with PM2

```bash
# Edit the cwd path in deploy/ecosystem.config.js first
nano deploy/ecosystem.config.js   # change /opt/randolph-portal if different

pm2 start deploy/ecosystem.config.js
pm2 save
pm2 startup   # follow the printed command to enable auto-start on reboot
```

Check it's running:
```bash
pm2 status
pm2 logs roc-portal
```

## 5. Set up Nginx (reverse proxy)

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/randolph-portal
# Edit the server_name line:
sudo nano /etc/nginx/sites-available/randolph-portal

sudo ln -s /etc/nginx/sites-available/randolph-portal /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## 6. HTTPS with Let's Encrypt (strongly recommended)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

Certbot automatically edits `nginx.conf` to enable the HTTPS block and sets up auto-renewal.

---

## After first login

1. Go to `https://your-domain.com` and sign in:
   - **PM Admin**: `admin@randolphofficecenter.com` / `Admin123!`
   - **PM Staff**: `staff@randolphofficecenter.com` / `Staff123!`

2. **Change both passwords immediately** via Admin Panel → Users.

3. Configure SMTP under Admin Panel → Settings → Email if you want email notifications.

4. Create tenant accounts via Admin Panel → Users → Add User.

---

## Common operations

| Task | Command |
|------|---------|
| View logs | `pm2 logs roc-portal` |
| Restart after code update | `pm2 restart roc-portal` |
| Check status | `pm2 status` |
| DB location | `/opt/randolph-portal/data/portal.db` |
| Backup DB | `cp data/portal.db data/portal.db.bak` |

The SQLite database file is the only thing you need to back up — it contains everything.
