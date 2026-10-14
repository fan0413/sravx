#!/bin/sh
# Certbot deploy hook: only reload a valid configuration after successful renewal.
set -eu
/usr/sbin/nginx -t
/bin/systemctl reload nginx
