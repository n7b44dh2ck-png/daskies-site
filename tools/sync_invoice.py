#!/usr/bin/env python3
"""Copies the invoice layout from assets/invoice-render.js into the send-invoice Edge Function,
so the emailed invoice and the invoice page are always the same. Run from the repo root:
    python3 tools/sync_invoice.py
Then deploy send-invoice again in Supabase (Edge Functions > send-invoice > Code)."""
import os, re
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
START, END = "// ---- invoice render start ----", "// ---- invoice render end ----"
src = open(os.path.join(ROOT, "assets/invoice-render.js"), encoding="utf-8").read()
block = src[src.index(START) + len(START):src.index(END)]
block = re.sub(r"^export ", "", block, flags=re.M)  # plain functions inside the Edge Function
fn = os.path.join(ROOT, "supabase/functions/send-invoice/index.ts")
s = open(fn, encoding="utf-8").read()
s = s[:s.index(START) + len(START)] + block + s[s.index(END):]
open(fn, "w", encoding="utf-8").write(s)
print("send-invoice: invoice layout synced,", block.count("\n"), "lines")
