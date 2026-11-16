#!/usr/bin/env python3
"""Version-stamp every script, stylesheet and translation reference with one fingerprint.

Run before each commit:  python3 tools/stamp.py
Pages then always load a matching set of files after an update, instead of mixing a cached old
file with a new one (which breaks ES module imports). The fingerprint is a hash of the asset
contents, so it changes only when an asset changes. Safe to run repeatedly.
"""
import glob, hashlib, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
STAMP = re.compile(r"\?v=[0-9a-f]{8}")

assets = sorted(glob.glob("assets/*.js") + glob.glob("assets/*.css") + glob.glob("i18n/*.json"))
h = hashlib.sha1()
for f in assets:
    h.update(f.encode()); h.update(STAMP.sub("", open(f, encoding="utf-8").read()).encode())
ver = h.hexdigest()[:8]

html_ref = re.compile(r"(assets/[\w-]+\.(?:js|css))(\?v=[0-9a-f]{8})?")
js_import = re.compile(r"""(["'])(\./[\w-]+\.js)(\?v=[0-9a-f]{8})?\1""")
i18n_ref = re.compile(r'("/i18n/"\+code\+"\.json)(\?v=[0-9a-f]{8})?(")')

changed = []
for f in sorted(glob.glob("*.html")):
    s = open(f, encoding="utf-8").read()
    t = html_ref.sub(lambda m: m.group(1) + "?v=" + ver, s)
    t = i18n_ref.sub(lambda m: m.group(1) + "?v=" + ver + m.group(3), t)
    if t != s: open(f, "w", encoding="utf-8").write(t); changed.append(f)
for f in sorted(glob.glob("assets/*.js")):
    s = open(f, encoding="utf-8").read()
    t = js_import.sub(lambda m: m.group(1) + m.group(2) + "?v=" + ver + m.group(1), s)
    if t != s: open(f, "w", encoding="utf-8").write(t); changed.append(f)

# Every reference must now carry the same fingerprint.
bad = []
for f in sorted(glob.glob("*.html") + glob.glob("assets/*.js")):
    for v in set(re.findall(r"\?v=([0-9a-f]{8})", open(f, encoding="utf-8").read())):
        if v != ver: bad.append((f, v))
print("version", ver, "| updated:", ", ".join(changed) or "nothing")
if bad: print("MISMATCH", bad); sys.exit(1)
