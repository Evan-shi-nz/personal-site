#!/usr/bin/env bash
# Sets up cn.evanshi.nz on a relay server with a good route to mainland China.
# Visitors in China are redirected there by the Worker; this server fetches every page
# from the real site (evanshi.nz on Cloudflare) and passes it on.
#
# Safe for servers that already run other things:
#   - it only CHECKS first and stops without changing anything if something looks wrong
#   - it never stops, restarts or reconfigures other programs
#   - it installs one program, Caddy (web server with automatic HTTPS certificates)
#   - if port 443 is taken (for example by a proxy), it uses another HTTPS port instead
# Needs: Debian or Ubuntu, root, port 80 free (for the free Let's Encrypt certificate),
# and a DNS record "cn" pointing at this server with Cloudflare's proxy OFF (grey cloud).
#
# Usage:  sudo bash setup.sh            (domain defaults to cn.evanshi.nz)
#         sudo bash setup.sh cn.example.com example.com
set -euo pipefail

MIRROR_HOST="${1:-cn.evanshi.nz}"
ORIGIN_HOST="${2:-evanshi.nz}"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
stop() { printf '\n\033[31mStopped: %s\033[0m\nNothing was changed on this server.\n' "$*"; exit 1; }
port_used() { ss -Hltn "sport = :$1" | grep -q . || ss -Hlun "sport = :$1" | grep -q .; }
who_uses() { ss -Hltnup "sport = :$1" 2>/dev/null | sed 's/^/    /'; }

say "1/6 Checking the server (no changes yet)"
[ "$(id -u)" = 0 ] || stop "please run as root (sudo bash setup.sh)."
command -v apt-get >/dev/null || stop "this script supports Debian or Ubuntu only."
command -v ss >/dev/null || stop "the 'ss' command is missing (package iproute2)."
if command -v caddy >/dev/null || [ -e /lib/systemd/system/caddy.service ] || [ -e /etc/systemd/system/caddy.service ]; then
  stop "Caddy is already installed here. Not touching an existing setup."
fi

if port_used 80; then
  echo "  Port 80 is used by:"; who_uses 80
  stop "port 80 is needed for the free HTTPS certificate but is already in use."
fi
HTTPS_PORT=""
for p in 443 8443 2053 2083 2087 2096 9443; do
  if ! port_used "$p"; then HTTPS_PORT="$p"; break; fi
done
[ -n "$HTTPS_PORT" ] || stop "no free HTTPS port among 443 8443 2053 2083 2087 2096 9443."
if [ "$HTTPS_PORT" != 443 ]; then
  echo "  Port 443 is already used (left alone):"; who_uses 443
  echo "  The mirror will use port $HTTPS_PORT instead."
fi
echo "  Port 80: free.  HTTPS port: $HTTPS_PORT."

say "2/6 Checking DNS for $MIRROR_HOST"
command -v curl >/dev/null || { apt-get update -qq && apt-get install -y -qq curl >/dev/null; }
MY_IP="$(curl -4 -fsS --max-time 10 https://api.ipify.org || true)"
DNS_IP="$(getent ahostsv4 "$MIRROR_HOST" | awk 'NR==1{print $1}' || true)"
echo "  This server: ${MY_IP:-unknown}   $MIRROR_HOST points to: ${DNS_IP:-nothing}"
if [ -z "$DNS_IP" ] || [ "$DNS_IP" != "$MY_IP" ]; then
  stop "add a DNS record in Cloudflare first: type A, name 'cn', IPv4 ${MY_IP:-<this server IP>}, Proxy status: DNS only (grey cloud). Wait a minute, then run this again."
fi

say "3/6 Installing Caddy from its official package repository"
apt-get update -qq
apt-get install -y -qq debian-keyring debian-archive-keyring apt-transport-https gnupg curl >/dev/null
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y -qq caddy >/dev/null
echo "  $(caddy version)"

say "4/6 Writing the configuration"
KEY="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
PORT_LINE=""
[ "$HTTPS_PORT" != 443 ] && PORT_LINE="	https_port $HTTPS_PORT"
cat > /etc/caddy/Caddyfile <<EOF
# cn mirror for visitors in mainland China; written by deploy/cn-mirror/setup.sh
{
$PORT_LINE
	servers {
		# HTTP/1.1 and HTTP/2 only, so UDP ports used by other programs are left alone
		protocols h1 h2
	}
}

$MIRROR_HOST {
	# The main site is the one search engines should list
	header X-Robots-Tag "noindex"
	reverse_proxy https://$ORIGIN_HOST {
		header_up Host $ORIGIN_HOST
		# Real visitor IP for the guestbook's spam limits, trusted only with this key
		header_up X-Mirror-Client-IP {remote_host}
		header_up X-Mirror-Key "$KEY"
		# Keep redirects on the mirror
		header_down Location "^https://$ORIGIN_HOST(:443)?/" "/"
		transport http {
			tls_server_name $ORIGIN_HOST
		}
	}
}
EOF
chown root:caddy /etc/caddy/Caddyfile
chmod 640 /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null

say "5/6 Opening the firewall (only if ufw is active) and starting Caddy"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null && ufw allow "$HTTPS_PORT"/tcp >/dev/null && echo "  ufw: allowed 80 and $HTTPS_PORT"
fi
systemctl enable caddy >/dev/null 2>&1 || true
systemctl restart caddy

URL="https://$MIRROR_HOST"
[ "$HTTPS_PORT" != 443 ] && URL="$URL:$HTTPS_PORT"
say "6/6 Waiting for the certificate and testing $URL"
ok=""
for _ in $(seq 1 24); do
  if curl -fsS --max-time 10 -o /dev/null "$URL/"; then ok=1; break; fi
  sleep 5
done
if [ -z "$ok" ]; then
  echo "  The site did not answer yet. Check:  journalctl -u caddy --no-pager | tail -30"
  echo "  Usual cause: ports 80 and $HTTPS_PORT are closed in the VPS provider's firewall / security group."
else
  echo "  $URL works."
fi

cat <<EOF

========================================================================
Done. Two things left, both in the Cloudflare dashboard
(Workers & Pages > personal-site > Settings > Variables and Secrets):

  1. Add a SECRET named  CN_MIRROR_KEY  with this value (do not share it):
       $KEY

  2. Mirror address for CN_MIRROR:  $URL
     (Claude can set this in wrangler.jsonc; it turns the redirect on.)

To undo everything later:  apt-get remove -y caddy
========================================================================
EOF
