#!/usr/bin/env python3
"""Speed block for every page, between <!-- perf --> markers right after the viewport meta.

- Opens the connections to Supabase and the script CDN while the page is still parsing.
- Preloads the page's own modules and the Supabase library in parallel, instead of one
  after another (page.js -> core.js -> supabase-js -> its parts -> their parts).
- Lets Chrome and Edge prepare a page as soon as the visitor hovers a link, so the click is instant.

Run after the page generators and before tools/stamp.py (stamp fills in the ?v= fingerprints).
Safe to run repeatedly.
"""
import glob, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

SUPABASE_URL = "https://auqhmkdeurfexrtzylyd.supabase.co"
CDN = "https://cdn.jsdelivr.net"
SB_VERSION = "2.119.0"
# supabase-js and everything it imports, pinned (must match the import in assets/core.js).
SB_MODULES = [
    f"@supabase/supabase-js@{SB_VERSION}/+esm",
    f"@supabase/auth-js@{SB_VERSION}/+esm",
    f"@supabase/postgrest-js@{SB_VERSION}/+esm",
    f"@supabase/functions-js@{SB_VERSION}/+esm",
    f"@supabase/realtime-js@{SB_VERSION}/+esm",
    f"@supabase/storage-js@{SB_VERSION}/+esm",
    "tslib@2.8.1/+esm",
    "@supabase/phoenix@0.4.5/+esm",
    "iceberg-js@0.8.1/+esm",
]
SPECULATION = ('<script type="speculationrules">{"prerender":[{"source":"document","where":{"and":['
               '{"href_matches":"/*"},{"not":{"selector_matches":"[target=_blank], [download], .no-prerender"}}]},'
               '"eagerness":"moderate"}]}</script>')

IMPORT = re.compile(r"""(?:^|\n)\s*import\s[^;]*?from\s*["']\./([\w-]+\.js)(?:\?v=[0-9a-f]{8})?["']""")
SIDE = re.compile(r"""(?:^|\n)\s*import\s*["']\./([\w-]+\.js)(?:\?v=[0-9a-f]{8})?["']""")
PAGE_MODULE = re.compile(r'<script type="module" src="assets/([\w-]+\.js)')
BLOCK = re.compile(r"\n?<!-- perf -->.*?<!-- /perf -->", re.S)
VIEWPORT = re.compile(r'(<meta name="viewport"[^>]*>)')
# After the error reporter, so a script that fails to preload is still reported.
BOOT = re.compile(r'(<script src="assets/boot\.js(?:\?v=[0-9a-f]{8})?"></script>)')

core_sb = open("assets/core.js", encoding="utf-8").read()
assert f"@supabase/supabase-js@{SB_VERSION}/+esm" in core_sb, "core.js must import the pinned supabase-js version"


def closure(mod, seen=None):
    seen = seen if seen is not None else []
    if mod in seen or not os.path.exists("assets/" + mod):
        return seen
    seen.append(mod)
    src = open("assets/" + mod, encoding="utf-8").read()
    for m in IMPORT.findall(src) + SIDE.findall(src):
        closure(m, seen)
    return seen


changed = []
for f in sorted(glob.glob("*.html")):
    s = open(f, encoding="utf-8").read()
    s0 = BLOCK.sub("", s)
    m = PAGE_MODULE.search(s0)
    mods = closure(m.group(1)) if m else []
    uses_sb = "core.js" in mods
    lines = ["<!-- perf -->"]
    if uses_sb:
        lines.append(f'<link rel="preconnect" href="{SUPABASE_URL}" crossorigin>')
        lines.append(f'<link rel="preconnect" href="{CDN}" crossorigin>')
    for mod in mods:
        lines.append(f'<link rel="modulepreload" href="assets/{mod}">')
    if uses_sb:
        for u in SB_MODULES:
            lines.append(f'<link rel="modulepreload" href="{CDN}/npm/{u}" crossorigin>')
    lines.append(SPECULATION)
    lines.append("<!-- /perf -->")
    block = "\n".join(lines)
    anchor = BOOT if BOOT.search(s0) else VIEWPORT
    if not anchor.search(s0):
        print("no anchor:", f); continue
    t = anchor.sub(lambda mm: mm.group(1) + "\n" + block, s0, count=1)
    if t != s:
        open(f, "w", encoding="utf-8").write(t); changed.append(f)
print("perf block:", len(changed), "pages updated")
