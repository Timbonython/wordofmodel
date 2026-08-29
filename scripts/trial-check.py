import json, sys

d = json.load(sys.stdin)
print("ledger: %s, proved=%s" % (d["mode"], d["modeProved"]))
if not d["examined"]:
    print("no live subscriptions. Nothing to check yet.")
    raise SystemExit
for s in d["subscriptions"]:
    print("")
    print("  plan             %s   (%s in our database)" % (s.get("plan"), s.get("priceKey")))
    print("  status           %s" % s.get("status"))
    print("  code used        %s" % s.get("code"))
    for x in s.get("discounts") or []:
        print("  discount         %s%% off, %s, %s months" % (x.get("percentOff"), x.get("duration"), x.get("months")))
    if not (s.get("discounts") or []):
        print("  discount         none")
    print("  card on sub      %s" % s.get("cardOnSubscription"))
    print("  card on customer %s" % s.get("cardOnCustomer"))
    print("  WILL COLLECT     %s   <- the one that matters" % s.get("willCollectAtFullPrice"))
    print("  period ends      %s" % s.get("periodEnd"))
    print("  cancelling       %s" % s.get("cancelAtPeriodEnd"))
    print("  extra locations  %s" % s.get("locations"))
