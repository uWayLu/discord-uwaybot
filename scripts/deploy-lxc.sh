#!/usr/bin/env bash
set -euo pipefail

PVE_HOST="${PVE_HOST:-pve7.lan}"
CTID="${CTID:-125}"
APP_DIR="${APP_DIR:-/opt/discord-uwaybot}"
SERVICE="${SERVICE:-discord-bot}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

log() { printf '\033[1;36m[deploy]\033[0m %s\n' "$*"; }

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  cat <<'EOF'
Deploy discord-uwaybot to the production LXC via the PVE host.

Usage: scripts/deploy-lxc.sh

Pushes the committed working tree of this repository directly into the
container (no GitHub credentials needed inside the LXC), then runs:
  npm ci -> build -> db:migrate -> deploy commands -> restart, and verifies.

Env overrides:
  PVE_HOST     SSH host of the Proxmox node   (default: pve7.lan)
  CTID         LXC container id               (default: 125)
  APP_DIR      project path inside the LXC    (default: /opt/discord-uwaybot)
  SERVICE      systemd unit name              (default: discord-bot)
  EXTRA_GUILDS extra guilds to register slash commands, comma-separated
               (default: 595888211742687242 = main guild)
EOF
  exit 0
fi

if command -v pct >/dev/null 2>&1; then
  run_in_ct() { pct exec "$CTID" -- bash -c "$1"; }
  push_to_ct() { pct exec "$CTID" -- tar -xf - -C "$APP_DIR"; }
elif [[ "$(hostname)" == "discord-bot" ]]; then
  echo "ERR: cannot deploy from inside the container; run from the PVE host or local machine." >&2
  exit 1
else
  run_in_ct() {
    local b64
    b64=$(printf '%s' "$1" | base64 | tr -d '\n')
    ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "$PVE_HOST" "pct exec $CTID -- bash -c \"echo $b64 | base64 -d | bash\""
  }
  push_to_ct() {
    ssh -o BatchMode=yes -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new \
      "$PVE_HOST" "pct exec '$CTID' -- tar -xf - -C '$APP_DIR'"
  }
fi

log "target: CT $CTID @ $PVE_HOST, project $APP_DIR, unit $SERVICE"

log "pre-flight: node >=22, .env present"
node_ver=$(run_in_ct "node --version")
case "$node_ver" in
  v2[0-9]*) : ;;
  *) log "ERROR: need node >=22, got $node_ver" >&2; exit 1 ;;
esac
log "node $node_ver  (repo: $REPO_DIR)"
run_in_ct "test -f '$APP_DIR/.env' || { echo 'ERROR: missing $APP_DIR/.env' >&2; exit 1; }"

git_ref="${DEPLOY_REF:-HEAD}"
log "push committed tree (${git_ref}) into container"
git -C "$REPO_DIR" archive --format=tar "$git_ref" | push_to_ct

log "npm ci"
run_in_ct "cd '$APP_DIR' && npm ci --no-audit --no-fund"

log "npm run build"
run_in_ct "cd '$APP_DIR' && npm run build"

log "npm run db:migrate"
run_in_ct "cd '$APP_DIR' && npm run db:migrate"

log "npm run deploy (register slash commands)"
run_in_ct "cd '$APP_DIR' && npm run deploy"

EXTRA_GUILDS="${EXTRA_GUILDS:-595888211742687242}"
if [[ -n "$EXTRA_GUILDS" ]]; then
  for guild in ${EXTRA_GUILDS//,/ }; do
    log "register commands for extra guild: $guild"
    run_in_ct "cd '$APP_DIR' && DISCORD_GUILD_ID='$guild' npm run deploy"
  done
fi

log "systemctl restart $SERVICE"
run_in_ct "systemctl restart '$SERVICE'"
sleep 2

state=$(run_in_ct "systemctl is-active '$SERVICE'")
log "service state: $state"
if [[ "$state" != "active" ]]; then
  run_in_ct "journalctl -u '$SERVICE' -n 50 --no-pager" >&2 || true
  exit 1
fi

pid=$(run_in_ct "systemctl show '$SERVICE' -p ExecMainPID --value")
log "pid: $pid"
log "last logs:"
run_in_ct "journalctl -u '$SERVICE' -n 15 --no-pager" || true
log "done"