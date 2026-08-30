import json, sys

mode = sys.argv[1] if len(sys.argv) > 1 else 'list'
d = json.load(sys.stdin)

if 'reviews' not in d:
    print(d)
    raise SystemExit(1)

if mode == 'copy':
    wanted = sys.argv[2]
    for r in d['reviews']:
        if r['id'].startswith(wanted):
            print('--- the review ---')
            print(r['copy']['text'])
            print('\n--- attribution ---')
            print(r['copy']['attribution'])
            print('\n--- the sentence the site renders ---')
            print(r['copy']['sentence'])
            print('\n--- LinkedIn ---')
            print(r['copy']['linkedin'])
            raise SystemExit(0)
    print('No review starts with that id.')
    raise SystemExit(1)

if not d['count']:
    print('  no reviews yet.')
    raise SystemExit(0)

print('  %d review(s)\n' % d['count'])
for r in d['reviews']:
    flags = []
    if r['featured']: flags.append('FEATURED')
    if r['order'] is not None: flags.append('order %s' % r['order'])
    if r['externalClicks']: flags.append('clicked: %s' % ', '.join(r['externalClicks'].keys()))
    print('  %s  %s  %s/5  %s' % (r['id'][:8], r['status'].upper().ljust(8), r['rating'], r['who']))
    print('    %s' % r['created'][:16])
    body = r['text'].replace('\n', ' ')
    print('    %s' % (body[:150] + ('...' if len(body) > 150 else '')))
    if flags: print('    [%s]' % '  '.join(flags))
    print('')
print('  approve:  sh scripts/reviews.sh approve <id>')
print('  reject:   sh scripts/reviews.sh reject <id>')
print('  linkedin: sh scripts/reviews.sh copy <id>')
