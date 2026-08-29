#!/bin/sh
# What a live subscription actually looks like inside Stripe.
#
# Run from the repo root:  sh scripts/trial-check.sh
#
# The secret is read out of .env.local and never printed. Nothing here writes anything: the
# endpoint it calls is read only.
SEC=$(awk -F= '/^CRON_SECRET/{print $2}' .env.local)
curl -s --max-time 60 -H "Authorization: Bearer $SEC" https://wordofmodel.ai/api/ops/subscriptions \
| python3 "$(dirname "$0")/trial-check.py"
