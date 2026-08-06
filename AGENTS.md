# ZenTaap deploy (Hostinger VPS)

When the user says **deploy**, run the SSH deploy below. Do not invent other hosts/paths.

## SSH
- Host alias: `zentaap` (`~/.ssh/config`)
- Server: `187.127.186.183`
- User: `zentaap-dev`
- App path: `/var/www/ZEN-TAAP-NEW-002`
- Branch: `main` → `Premsai2006/ZEN-TAAP-NEW-002`
- Frontend: nginx serves `frontend/build`
- Backend: supervisor `zentaap` → uvicorn on `127.0.0.1:8000`

Never commit/print `.env` secrets. Never overwrite remote `.env`.

## Workflow
1. Commit + push to `origin/main` (when asked)
2. Deploy via SSH
3. Verify API + supervisor status
4. Smoke-test production

## Deploy command
```bash
ssh -o BatchMode=yes -o ConnectTimeout=20 zentaap 'set -e
cd /var/www/ZEN-TAAP-NEW-002
git stash push -u -m "pre-deploy $(date +%Y%m%d%H%M%S)" 2>/dev/null || true
git fetch origin
git checkout main
git pull --ff-only origin main
git log -1 --oneline
cd backend
source venv/bin/activate
pip install -q -r requirements.txt
deactivate
sudo supervisorctl restart zentaap
cd ../frontend
yarn install --ignore-engines
CI=false yarn build
sleep 2
curl -s http://127.0.0.1:8000/api/auth/status
sudo supervisorctl status zentaap
'
```
