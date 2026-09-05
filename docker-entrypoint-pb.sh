#!/bin/sh
# Upsert superuser saat boot (kalau env diset), lalu serve.
# Dipakai oleh deploy NekoApps agar instance baru langsung siap di-seed.
if [ -n "$PB_SUPERUSER_EMAIL" ] && [ -n "$PB_SUPERUSER_PASSWORD" ]; then
	/usr/local/bin/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=/pb_data || true
fi
exec /usr/local/bin/pocketbase serve --http=0.0.0.0:8094 --dir=/pb_data --automigrate=false
