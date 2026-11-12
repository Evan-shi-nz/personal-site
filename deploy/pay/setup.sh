#!/usr/bin/env bash
# Sets up a self-hosted crypto payment gateway (BEpusdt, https://github.com/v03413/BEpusdt)
# on its own server, reachable over HTTPS at pay.evanshi.nz (or another domain).
# All websites share this one gateway: each creates orders through its API and gets a callback
# when the order is paid.
#
#   BEpusdt  runs in Docker, listening only on 127.0.0.1:8080 (never exposed directly)
#   Caddy    serves https://<domain> with a free Let's Encrypt certificate and forwards to BEpusdt
#   Data     /opt/bepusdt on this server (SQLite database), kept when the container is replaced
#
# Like deploy/cn-mirror/setup.sh it only CHECKS first and stops without changing anything if
# something looks wrong. Meant for a fresh server used only for payments.
# Needs: Debian or Ubuntu, root, ports 80 and 443 free and open in the provider's firewall,
# and a DNS record for the domain pointing at this server with Cloudflare's proxy OFF (grey cloud).
#
# Usage:  sudo bash setup.sh                 (domain defaults to pay.evanshi.nz)
#         sudo bash setup.sh pay.example.com
set -euo pipefail

PAY_HOST="${1:-pay.evanshi.nz}"
IMAGE="v03413/bepusdt:latest"
DATA_DIR="/opt/bepusdt"
NAME="bepusdt"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
stop() { printf '\n\033[31mStopped: %s\033[0m\nNothing was changed on this server.\n' "$*"; exit 1; }
fail() { printf '\n\033[31mStopped: %s\033[0m\n' "$*"; exit 1; }
port_used() { ss -Hltn "sport = :$1" | grep -q .; }
who_uses() { ss -Hltnp "sport = :$1" 2>/dev/null | sed 's/^/    /'; }

say "1/7 Checking the server (no changes yet)"
[ "$(id -u)" = 0 ] || stop "please run as root (sudo bash setup.sh)."
command -v apt-get >/dev/null || stop "this script supports Debian or Ubuntu only."
command -v ss >/dev/null || stop "the 'ss' command is missing (package iproute2)."
if command -v caddy >/dev/null || [ -e /lib/systemd/system/caddy.service ] || [ -e /etc/systemd/system/caddy.service ]; then
  stop "Caddy is already installed here. Not touching an existing setup."
fi
if command -v docker >/dev/null && docker inspect "$NAME" >/dev/null 2>&1; then
  stop "a Docker container named '$NAME' already exists. Not touching an existing setup."
fi
for p in 80 443 8080; do
  if port_used "$p"; then
    echo "  Port $p is used by:"; who_uses "$p"
    stop "port $p is needed but already in use."
  fi
done
echo "  Ports 80, 443 and 8080: free."

say "2/7 Checking DNS for $PAY_HOST"
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl >/dev/null; }
MY_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$PAY_HOST" | awk 'NR==1{print $1}' || true)"
echo "  This server: ${MY_IP:-unknown}   $PAY_HOST points to: ${DNS_IP:-nothing}"
if [ -z "$DNS_IP" ] || [ "$DNS_IP" != "$MY_IP" ]; then
  stop "add a DNS record in Cloudflare first: type A, name '${PAY_HOST%%.*}', IPv4 ${MY_IP:-<this server IP>}, Proxy status: DNS only (grey cloud). Wait a minute, then run this again."
fi

say "3/7 Turning on clock sync (BEpusdt needs the correct time)"
timedatectl set-ntp true 2>/dev/null || true
timedatectl 2>/dev/null | grep -E "synchronized|NTP service" | sed 's/^ */  /' || true

say "4/7 Installing Docker (skipped if already installed)"
if command -v docker >/dev/null; then
  echo "  $(docker --version)"
else
  apt-get update -qq
  apt-get install -y -qq docker.io >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
  echo "  $(docker --version)"
fi

say "5/7 Starting BEpusdt"
mkdir -p "$DATA_DIR"
# The same command later updates BEpusdt to the newest version: sudo bepusdt-update
cat > /usr/local/bin/bepusdt-update <<EOF
#!/bin/sh
# Pulls the newest BEpusdt image and recreates the container; data in $DATA_DIR is kept.
# Written by deploy/pay/setup.sh
set -e
docker pull -q $IMAGE
docker rm -f $NAME >/dev/null 2>&1 || true
# 127.0.0.1 only: reached through Caddy (HTTPS), never on port 8080 from outside.
# Log size is capped so the disk does not slowly fill up.
docker run -d --name $NAME --restart=unless-stopped \\
  -p 127.0.0.1:8080:8080 \\
  -v $DATA_DIR:/var/lib/bepusdt \\
  --log-opt max-size=10m --log-opt max-file=3 \\
  $IMAGE
EOF
chmod 755 /usr/local/bin/bepusdt-update
/usr/local/bin/bepusdt-update >/dev/null
ok=""
for _ in $(seq 1 30); do
  # any HTTP answer (even an error page) means the program is up
  if curl -sS --max-time 3 -o /dev/null http://127.0.0.1:8080/ 2>/dev/null; then ok=1; break; fi
  sleep 2
done
[ -n "$ok" ] || { docker logs --tail 30 "$NAME"; fail "BEpusdt did not start (logs above). Remove it with: docker rm -f $NAME"; }
echo "  Running ($IMAGE)."

say "6/7 Installing Caddy and writing its configuration"
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg curl >/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy >/dev/null
echo "  $(caddy version)"
cat > /etc/caddy/Caddyfile <<EOF
# Payment gateway; written by deploy/pay/setup.sh
$PAY_HOST {
	header X-Robots-Tag "noindex"
	encode gzip
	reverse_proxy 127.0.0.1:8080
}
EOF
chown root:caddy /etc/caddy/Caddyfile
chmod 640 /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow 443/tcp >/dev/null && echo "  ufw: allowed 80 and 443"
fi
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

URL="https://$PAY_HOST"
say "7/7 Waiting for the certificate and testing $URL"
ok=""
for _ in $(seq 1 24); do
  if curl -sS --max-time 10 -o /dev/null "$URL/"; then ok=1; break; fi
  sleep 5
done
if [ -z "$ok" ]; then
  echo "  $URL did not answer yet. Check:  journalctl -u caddy --no-pager | tail -30"
  echo "  Usual cause: ports 80 and 443 are closed in the VPS provider's firewall / security group."
else
  echo "  $URL works."
fi

cat <<EOF

========================================================================
Done. BEpusdt's first start log is below: look for the admin address
(security entry path) and any first-time setup notes.
------------------------------------------------------------------------
$(docker logs --tail 40 "$NAME" 2>&1)
------------------------------------------------------------------------
Next:
  1. Open the admin address from the log, but on  $URL
     (not http://IP:8080, which is closed to the outside on purpose).
     The setup wizard creates the admin account: use a long, unique password.
  2. In the admin panel: add your receiving wallet address(es), set the API token
     (keep it secret, it goes only into each website's server-side secrets),
     and add a TronGrid API key if you take TRON payments.

Useful commands:
  docker logs -f $NAME                     live log
  docker exec -it $NAME bepusdt reset      reset the admin login
  bepusdt-update                           update to the newest version (data is kept)
To undo everything:  docker rm -f $NAME; apt-get remove -y caddy; rm /usr/local/bin/bepusdt-update
                     (the database stays in $DATA_DIR until you delete it)
========================================================================
EOF
