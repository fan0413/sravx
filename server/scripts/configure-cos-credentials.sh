#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo 'Run this command with sudo.' >&2
  exit 1
fi

read -r -s -p 'COS SecretId: ' COS_SECRET_ID
printf '\n'
read -r -s -p 'COS SecretKey: ' COS_SECRET_KEY
printf '\n'
read -r -p 'COS bucket [sravx-1419382340]: ' COS_BUCKET
COS_BUCKET="${COS_BUCKET:-sravx-1419382340}"
read -r -p 'COS region [ap-shanghai]: ' COS_REGION
COS_REGION="${COS_REGION:-ap-shanghai}"

if [[ -z "${COS_SECRET_ID}" || -z "${COS_SECRET_KEY}" ]]; then
  echo 'SecretId and SecretKey are required.' >&2
  exit 1
fi
if [[ "${COS_SECRET_ID}" == *$'\n'* || "${COS_SECRET_KEY}" == *$'\n'* || "${COS_BUCKET}" == *$'\n'* || "${COS_REGION}" == *$'\n'* ]]; then
  echo 'Credential values must be single-line strings.' >&2
  exit 1
fi

install -d -o deploy -g deploy -m 700 /home/deploy/.config/sravx
temporary_file="$(mktemp /home/deploy/.config/sravx/.cos.env.XXXXXX)"
trap 'rm -f "${temporary_file}"' EXIT
printf 'COS_SECRET_ID=%s\nCOS_SECRET_KEY=%s\nCOS_BUCKET=%s\nCOS_REGION=%s\n' "$COS_SECRET_ID" "$COS_SECRET_KEY" "$COS_BUCKET" "$COS_REGION" > "$temporary_file"
chown deploy:deploy "$temporary_file"
chmod 600 "$temporary_file"
mv -f "$temporary_file" /home/deploy/.config/sravx/cos.env
trap - EXIT
echo 'COS credentials were saved to the restricted server configuration. Restart the API service to load them.'
