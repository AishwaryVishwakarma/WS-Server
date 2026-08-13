#!/bin/sh
set -eu

database_path="${GEOIP_DATABASE_PATH:-/usr/share/GeoIP/GeoLite2-City.mmdb}"

if [ -n "${MAXMIND_ACCOUNT_ID:-}" ] && [ -n "${MAXMIND_LICENSE_KEY:-}" ]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  credentials="$temp_dir/maxmind.netrc"
  printf 'machine download.maxmind.com login %s password %s\n' \
    "$MAXMIND_ACCOUNT_ID" "$MAXMIND_LICENSE_KEY" > "$credentials"
  chmod 600 "$credentials"

  if curl --fail --silent --show-error --location --retry 3 \
    --netrc-file "$credentials" \
    'https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz' \
    | tar -xz -C "$temp_dir"; then
    downloaded="$(find "$temp_dir" -name 'GeoLite2-City.mmdb' -type f | head -n 1)"
    if [ -n "$downloaded" ]; then
      mkdir -p "$(dirname "$database_path")"
      cp "$downloaded" "$database_path"
      echo '[startup] GeoLite2 City database updated.'
    fi
  else
    echo '[startup] GeoLite2 download failed; continuing without IP location lookup.' >&2
  fi
fi

exec "$@"
