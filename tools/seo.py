#!/usr/bin/env python3
"""Search and share tags for every page, in one place.

Run from the repo root after tools/build_pages.py and tools/build_guides.py, and before tools/stamp.py:
    python3 tools/seo.py
For each page it sets the <title> and description, and writes one block between <!-- seo --> and <!-- /seo -->:
canonical link, robots, Open Graph and X (Twitter) cards, icons, and structured data (JSON-LD).
It also rewrites sitemap.xml from the pages marked as indexable.
"""
import html, json, os, re, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
SITE = "https://daskies.com"
TODAY = datetime.date.today().isoformat()
E = html.escape
OG = SITE + "/assets/og.png"

# file: (title, description, indexable, breadcrumb label or None, sitemap priority)
PAGES = {
  "index.html": ("DASKIES: lease, buy, sell or barter industrial capacity in India",
                 "DASKIES is the business network for Indian industry. Lease idle factories and machines, buy and sell used machinery, storage and bulk commodities, or swap them in two-, three- and four-party barter deals.", True, None, "1.0"),
  "explore.html": ("Explore industrial listings in India: machines, storage, commodities | DASKIES",
                   "Search what Indian businesses have and what they need: used machinery, factory sheds, warehouses, bulk commodities, property, technology and projects. Free to browse.", True, "Explore", "0.9"),
  "for-startups.html": ("For startups: lease machines, rent space and make products without big capital | DASKIES",
                        "Start manufacturing without buying a factory. Lease machines and sheds, use contract manufacturing and job work, buy used machines, rent storage and barter for what you need on DASKIES.", True, "For startups", "0.9"),
  "for-businesses.html": ("For established businesses: earn from idle machines, sheds and spare capacity | DASKIES",
                          "Turn idle machines, empty sheds, spare shifts and surplus stock into cash, rent or swaps. DASKIES connects established Indian businesses with buyers in India and abroad.", True, "For established businesses", "0.9"),
  "leasing.html": ("Industrial leasing in India: rent out factory sheds and spare capacity | DASKIES",
                   "Rent out idle factory sheds, production lines and spare shifts, or lease capacity without building a plant. Monthly, long-term or per-shift terms on DASKIES.", True, "Industrial leasing", "0.8"),
  "machines.html": ("Used industrial machinery for sale, lease or swap in India | DASKIES",
                    "Sell, rent out or swap used CNC machines, presses, boilers and plant machinery. Buyers get proven machines for less than new; sellers release cash locked in idle equipment.", True, "Used machines", "0.8"),
  "storage.html": ("Warehouse, cold storage and tank space for rent in Gujarat | DASKIES",
                   "Rent out empty warehouse, cold storage, tank or port storage, or find space near Mundra, Kandla, farms and industrial areas. Short or long-term rent on DASKIES.", True, "Storage and warehousing", "0.8"),
  "agri.html": ("Bulk agri commodities from Gujarat: groundnut, cumin, castor, cotton | DASKIES",
                "Buy or sell groundnut, cumin, castor, cotton, edible oils and pulses in bulk, straight from origin, with grade, quantity and inspection agreed in writing.", True, "Agriculture and commodities", "0.8"),
  "construction.html": ("Buy a shop, office or home at cost with a buyer group | DASKIES",
                        "Join a buyer group for a shop, showroom, office or home in the area you choose. Land and construction at cost plus a fixed fee agreed at the start.", True, "Construction at cost", "0.7"),
  "technology.html": ("Sell, license or donate technology, equipment and training | DASKIES",
                      "Sell or license software, machines and know-how to factories, or donate computers, equipment and training to schools and skill centres through DASKIES.", True, "Technology and education", "0.7"),
  "global-buyers.html": ("Contract manufacturing and factory leasing in Gujarat for overseas buyers | DASKIES",
                         "For importers in the US, Europe, the Gulf and Africa: lease running capacity or contract production with Gujarat manufacturers and ship from Mundra.", True, "Global buyers", "0.8"),
  "services.html": ("Services: featured listings, verification and deal managers | DASKIES",
                    "Featured listings, business verification, deal managers, the Global Buyer Desk, valuation support and advertising from the DASKIES team.", True, "Services", "0.6"),
  "partners.html": ("Partner with DASKIES: referral fees for brokers, CAs and valuers",
                    "Brokers, chartered accountants, valuers, consultants and industry associations: refer businesses to DASKIES and earn a referral fee on every deal that closes.", True, "Partners", "0.6"),
  "guides.html": ("Guides for Indian businesses: barter, used machinery, leasing | DASKIES",
                  "Plain guides for Indian businesses: how business-to-business barter works under GST, how to sell a used machine, and what to check before leasing a shed or warehouse.", True, "Guides", "0.8"),
  "pricing.html": ("Pricing: join free, membership and success fee | DASKIES",
                   "Join DASKIES free. Full membership is ₹15,000 + GST for 90 days. A success fee applies only when a deal contract is signed.", True, "Pricing", "0.6"),
  "about.html": ("About DASKIES: putting India's idle industrial capacity to work",
                 "DASKIES connects businesses that have idle machines, sheds, storage and stock with businesses that need them, in India and across the world.", True, "About us", "0.6"),
  "contact.html": ("Contact DASKIES", "Contact DASKIES Group at info@daskies.com.", True, "Contact us", "0.5"),
  "terms.html": ("Terms of use | DASKIES", "The terms for using DASKIES, including membership, listings, deals and the success fee.", True, "Terms", "0.3"),
  "privacy.html": ("Privacy policy | DASKIES", "What DASKIES collects, who can see it, and how to correct or delete your information.", True, "Privacy", "0.3"),
  "refunds.html": ("Refunds and cancellations | DASKIES", "How DASKIES handles refunds, cancellations and payments made in error.", True, "Refunds and cancellations", "0.3"),
  # member pages: never in search results
  "account.html": ("Sign in or join | DASKIES", "Sign in to DASKIES or create a free account.", False, None, None),
  "dashboard.html": ("Dashboard | DASKIES", "Your DASKIES dashboard.", False, None, None),
  "deal.html": ("Deal room | DASKIES", "DASKIES deal room.", False, None, None),
  "post.html": ("Post a listing | DASKIES", "List what you have or post what you need.", False, None, None),
  "admin.html": ("Admin | DASKIES", "DASKIES administration.", False, None, None),
  "invoice.html": ("Invoice | DASKIES", "Your DASKIES tax invoice.", False, None, None),
}
# Guides: added by tools/build_guides.py through guides.json (title, description, label, date)
if os.path.exists("tools/guides.json"):
    for g in json.load(open("tools/guides.json", encoding="utf-8")):
        PAGES[g["file"]] = (g["seo_title"], g["description"], True, g["label"], "0.7")

ICONS = ('<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n'
         '<link rel="icon" href="/favicon-48.png" sizes="48x48" type="image/png">\n'
         '<link rel="apple-touch-icon" href="/apple-touch-icon.png">')

ORG = {"@type": "Organization", "@id": SITE + "/#org", "name": "DASKIES", "url": SITE + "/", "logo": SITE + "/assets/logo-512.png",
       "email": "info@daskies.com", "areaServed": "IN",
       "address": {"@type": "PostalAddress", "addressLocality": "Ahmedabad", "addressRegion": "Gujarat", "addressCountry": "IN"},
       "description": "The business network for Indian industry: lease, buy, sell, barter or donate machines, space, capacity and stock.",
       "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "email": "info@daskies.com", "availableLanguage": ["English", "Hindi", "Gujarati"]}}
WEBSITE = {"@type": "WebSite", "@id": SITE + "/#website", "name": "DASKIES", "url": SITE + "/", "publisher": {"@id": SITE + "/#org"}, "inLanguage": "en-IN",
           "potentialAction": {"@type": "SearchAction", "target": {"@type": "EntryPoint", "urlTemplate": SITE + "/explore.html?q={search_term_string}"}, "query-input": "required name=search_term_string"}}

def url_of(f):
    return SITE + "/" if f == "index.html" else f"{SITE}/{f}"

def ld(f, title, desc, crumb, article):
    graph = []
    if f == "index.html":
        graph += [ORG, WEBSITE]
    if crumb:
        items = [{"@type": "ListItem", "position": 1, "name": "DASKIES", "item": SITE + "/"}]
        if article:
            items.append({"@type": "ListItem", "position": 2, "name": "Guides", "item": SITE + "/guides.html"})
        items.append({"@type": "ListItem", "position": len(items) + 1, "name": crumb, "item": url_of(f)})
        graph.append({"@type": "BreadcrumbList", "itemListElement": items})
    if article:
        graph.append({"@type": "Article", "headline": article["h1"], "description": desc, "datePublished": article["date"], "dateModified": article.get("modified", article["date"]),
                      "author": {"@type": "Organization", "name": "DASKIES", "url": SITE + "/"}, "publisher": {"@type": "Organization", "name": "DASKIES", "logo": {"@type": "ImageObject", "url": SITE + "/assets/logo-512.png"}},
                      "mainEntityOfPage": url_of(f), "image": OG, "inLanguage": "en-IN"})
    if not graph:
        return ""
    data = {"@context": "https://schema.org", "@graph": graph}
    return '<script type="application/ld+json">' + json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/") + "</script>"

articles = {}
if os.path.exists("tools/guides.json"):
    articles = {g["file"]: g for g in json.load(open("tools/guides.json", encoding="utf-8"))}

done = []
for f, (title, desc, index, crumb, prio) in PAGES.items():
    if not os.path.exists(f):
        continue
    s = open(f, encoding="utf-8").read()
    s = re.sub(r"\n?<!-- seo -->.*?<!-- /seo -->", "", s, flags=re.S)
    s = re.sub(r"<title>.*?</title>", lambda m: f"<title>{E(title)}</title>", s, count=1, flags=re.S)
    s = re.sub(r'<meta name="description" content=".*?">', lambda m: f'<meta name="description" content="{E(desc)}">', s, count=1)
    s = re.sub(r'\n<meta name="robots" content="[^"]*">', "", s)
    s = re.sub(r'\n<link rel="icon" href="data:image/svg\+xml[^"]*">', "", s)
    s = re.sub(r'\n<meta (?:property="og:[^"]+"|name="twitter:[^"]+") content="[^"]*">', "", s)  # older share tags
    block = ["<!-- seo -->"]
    if index:
        if f != "listing.html":
            block.append(f'<link rel="canonical" href="{url_of(f)}">')
        block.append('<meta name="robots" content="index, follow, max-image-preview:large">')
    else:
        block.append('<meta name="robots" content="noindex, follow">')
    block.append(ICONS)
    block.append('<meta name="theme-color" content="#13282B">')
    if index:
        block += [f'<meta property="og:site_name" content="DASKIES">',
                  f'<meta property="og:type" content="{"article" if f in articles else "website"}">',
                  f'<meta property="og:title" content="{E(title)}">', f'<meta property="og:description" content="{E(desc)}">',
                  f'<meta property="og:url" content="{url_of(f)}">', f'<meta property="og:image" content="{OG}">',
                  '<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">',
                  '<meta property="og:image:alt" content="DASKIES: lease, buy, sell or barter industrial capacity">', '<meta property="og:locale" content="en_IN">',
                  '<meta name="twitter:card" content="summary_large_image">', f'<meta name="twitter:title" content="{E(title)}">',
                  f'<meta name="twitter:description" content="{E(desc)}">', f'<meta name="twitter:image" content="{OG}">']
        j = ld(f, title, desc, crumb, articles.get(f))
        if j:
            block.append(j)
    block.append("<!-- /seo -->")
    # the block goes right after the description
    s = re.sub(r'(<meta name="description" content=".*?">)', lambda m: m.group(1) + "\n" + "\n".join(block), s, count=1)
    open(f, "w", encoding="utf-8").write(s)
    done.append(f)

# listing.html: indexable (each listing gets its own canonical from assets/listing.js), not in the sitemap
s = open("listing.html", encoding="utf-8").read()
s = re.sub(r"\n?<!-- seo -->.*?<!-- /seo -->", "", s, flags=re.S)
s = re.sub(r'\n<link rel="icon" href="data:image/svg\+xml[^"]*">', "", s)
s = re.sub(r'(<meta name="description" content=".*?">)', lambda m: m.group(1) + "\n<!-- seo -->\n" + ICONS + '\n<meta name="theme-color" content="#13282B">\n<meta property="og:site_name" content="DASKIES">\n<meta property="og:type" content="website">\n<meta property="og:image" content="' + OG + '">\n<meta name="twitter:card" content="summary_large_image">\n<!-- /seo -->', s, count=1)
open("listing.html", "w", encoding="utf-8").write(s)

urls = "\n".join(f"  <url><loc>{url_of(f)}</loc><lastmod>{TODAY}</lastmod><priority>{p}</priority></url>"
                 for f, (t, d, i, c, p) in PAGES.items() if i and os.path.exists(f))
open("sitemap.xml", "w", encoding="utf-8").write(f'<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n{urls}\n</urlset>\n')
print("seo:", len(done), "pages; sitemap:", urls.count("<url>"), "urls")
