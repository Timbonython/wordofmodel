#!/bin/sh
# Moderate reviews from the command line.
#
#   sh scripts/reviews.sh                    every submission, newest first
#   sh scripts/reviews.sh pending            just the queue
#   sh scripts/reviews.sh approve <id>       publish it
#   sh scripts/reviews.sh reject  <id>       refuse it
#   sh scripts/reviews.sh feature <id>       put it at the top
#   sh scripts/reviews.sh order   <id> <n>   set display order
#   sh scripts/reviews.sh copy    <id>       the LinkedIn-ready version
#
# The secret is read from .env.local and never printed. Typos in a review body are edited in
# the Supabase SQL editor, the same place the migrations are run.
SEC=$(awk -F= '/^CRON_SECRET/{print $2}' .env.local)
BASE="https://wordofmodel.ai/api/ops/reviews"
DIR=$(dirname "$0")

post() {
  curl -s --max-time 40 -X POST "$BASE" -H "Authorization: Bearer $SEC" \
    -H 'Content-Type: application/json' -d "$1"
  echo
}

case "$1" in
  approve) post "{\"id\":\"$2\",\"status\":\"approved\"}" ;;
  reject)  post "{\"id\":\"$2\",\"status\":\"rejected\"}" ;;
  feature) post "{\"id\":\"$2\",\"featured\":true}" ;;
  order)   post "{\"id\":\"$2\",\"displayOrder\":$3}" ;;
  copy)    curl -s --max-time 40 -H "Authorization: Bearer $SEC" "$BASE" | python3 "$DIR/reviews.py" copy "$2" ;;
  pending) curl -s --max-time 40 -H "Authorization: Bearer $SEC" "$BASE?status=pending" | python3 "$DIR/reviews.py" list ;;
  *)       curl -s --max-time 40 -H "Authorization: Bearer $SEC" "$BASE" | python3 "$DIR/reviews.py" list ;;
esac
