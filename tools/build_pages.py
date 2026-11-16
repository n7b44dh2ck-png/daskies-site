#!/usr/bin/env python3
"""Builds the marketplace pages and the Global buyers, Services and Partners pages from one template.

Run from the repo root:  python3 tools/build_pages.py   (then tools/stamp.py)
Photos are free-licence Unsplash photos (commercial use allowed), loaded from Unsplash's image CDN.
"""
import html, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
E = html.escape

def photo(pid, w=1400):
    return f"https://images.unsplash.com/photo-{pid}?auto=format&fit=crop&w={w}&q=72"

def img(pid, alt, w=1400, eager=False):
    return (f'<img src="{photo(pid, w)}" srcset="{photo(pid, 700)} 700w, {photo(pid, w)} {w}w" '
            f'sizes="(max-width:900px) 100vw, 50vw" alt="{E(alt)}" {"" if eager else "loading=\"lazy\" "}decoding="async">')

MARKETS = [
  dict(slug="leasing", name="Industrial leasing", photo="1652204775379-2b4ace437a2d", alt="An empty factory shed with green steel columns",
       promise="Turn idle factories and spare shifts into monthly income",
       intro="Most factories do not use all their space or machines. Rent out empty sheds, floors, production lines or spare shifts to companies, in India and abroad, that need capacity without building a new plant.",
       how=["Register free, then send 3 photos, size, power load and a valuation report.", "We review it and show it to businesses looking for that capacity, in India and abroad.", "Agree monthly, long-term or per-shift rent, or swap capacity for goods you need.", "Sign the lease and start earning."],
       who=["Factory owners with idle space or shifts", "Brands that need capacity without capital spending", "Overseas buyers moving production to India"],
       gain=["Rent from things that earn nothing today", "Tenants start production in weeks, not years", "A swap option when cash is short"],
       cta="List capacity", post="post.html?kind=offer&v=industrial", v="industrial", groups="Industrial properties|Industrial capacity|Equipment leasing"),
  dict(slug="machines", name="Used machines", photo="1787039467622-ddec5c24320c", alt="CNC machines in a bright workshop",
       promise="Release the cash locked in machinery",
       intro="A machine that is not used loses value every month. Sell it, rent it out or swap it with companies that want good used machines for less than the price of new ones.",
       how=["Register free, then send 3 photos (one of the nameplate), make, model, year, condition and a valuation report.", "Buyers in the same category and price range see it.", "Sell it, rent it out, or swap it for a machine you need.", "Our team helps with inspection, transport and paperwork."],
       who=["Manufacturers upgrading or closing a line", "Machinery dealers", "Buyers who want proven machines at lower cost"],
       gain=["Cash or rent from unused machines", "Buyers pay less than for new machines", "Machine-for-machine swaps, any difference paid in cash"],
       cta="List a machine", post="post.html?kind=offer&v=industrial", v="industrial", groups="Industrial machinery"),
  dict(slug="storage", name="Storage & warehousing", photo="1644079446600-219068676743", alt="A long warehouse aisle with full shelves",
       promise="Fill empty space, or find the right space fast",
       intro="Rent out empty warehouse, cold storage, tank or port storage. Or find storage for less near Mundra, Kandla, farms and industrial areas.",
       how=["Register free, then send photos, capacity (sq ft, tonnes or KL), facilities and rent.", "Businesses looking for that place and size see it.", "Agree the period, rent and handling charges.", "Move goods in."],
       who=["Warehouse and cold-storage owners", "Exporters and importers near the ports", "Traders storing seasonal stock"],
       gain=["Rent from empty space", "Storage close to ports and farms", "Short or long-term rent"],
       cta="List storage", post="post.html?kind=offer&v=storage", v="storage", groups=""),
  dict(slug="agri", name="Agriculture & commodities", photo="1764070254247-351def349875", alt="Open sacks of grain and spices in a store",
       promise="Bulk trade, straight from origin",
       intro="Gujarat grows much of India's groundnut, cumin, castor and cotton. Buy or sell in bulk directly, with fewer middlemen, quality and quantity agreed in writing. You can also rent out farm land.",
       how=["Tell us the product, grade, quantity (tonnes), packing and delivery place.", "We introduce matching buyers or sellers.", "Agree price, payment terms and inspection.", "Dispatch with full documents, in India or for export."],
       who=["Processors, millers and traders", "Exporters and overseas importers", "Farmers and landowners leasing land"],
       gain=["Better prices with fewer middlemen", "Quality agreed in writing", "Income from land you don't farm"],
       cta="Post a requirement", post="post.html?kind=need&v=commodity", v="commodity", groups=""),
  dict(slug="construction", name="Construction at cost", photo="1527335988388-b40ee248d80c", alt="A steel building frame rising beside a tower crane",
       promise="Own a shop, showroom, office or home at cost",
       intro="People who want the same kind of property in the same area join one buyer group. We buy land in the area the group chooses and build it ready-to-use (turnkey) for a fixed charge agreed at the start. You pay for land and construction, not a builder's profit. Landowners can also join as partners.",
       how=["Tell us what you want (shop, showroom, office, flat or villa), the area you prefer and your budget.", "We group you with buyers who want the same thing in the same area.", "Our team finds and buys land there for the group.", "We build it ready-to-use for a fixed charge agreed before work starts.", "You get your unit with clear ownership papers."],
       who=["Retailers and showroom owners", "Doctors, CAs and other professionals who need offices", "Families buying a home", "Landowners and developers looking for JV partners"],
       gain=["No builder profit: you pay land, construction and a fixed fee", "You choose the location and design", "Construction charge fixed before work starts"],
       cta="Register your interest", post="#interest", v="real-assets", groups=""),
  dict(slug="technology", name="Technology & education", photo="1640955785023-1854685dae05", alt="Tweezers placing a microchip on a circuit board",
       promise="Share, sell or donate technology and learning",
       intro="Technology and knowledge help more people when they are shared. Sell or license your software, machines or know-how to factories that need them. Or donate computers, equipment, software, books or training to schools, colleges and skill centres.",
       how=["Tell us what you have: technology, equipment, software, books or training.", "Choose to sell, license or donate.", "We match you with factories that need it, or schools and training centres that can use it.", "Hand it over with clear paperwork."],
       who=["Innovators, startups and software companies", "Companies with spare computers, machines or tools", "Schools, colleges and skill centres", "Factories that want to modernise"],
       gain=["Licence fees or sale income", "Buyers save the cost of building from zero", "Your donation helps students learn real skills"],
       cta="Register to share or donate", post="post.html?kind=offer&v=barter-tech", v="barter-tech", groups=""),
]

def head(title, desc, ver):
    tpl = open("about.html", encoding="utf-8").read().split("<body>")[0]
    tpl = re.sub(r"<title>.*?</title>", f"<title>{E(title)} — DASKIES</title>", tpl)
    tpl = re.sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{E(desc)}">', tpl)
    return tpl

def page(fname, title, desc, body):
    ver = re.search(r"page\.js\?v=([0-9a-f]+)", open("about.html", encoding="utf-8").read()).group(1)
    out = head(title, desc, ver) + '<body>\n<main class="wrap" id="main" tabindex="-1">\n' + body.strip() + \
        f'\n</main>\n<script type="module" src="assets/marketing.js?v={ver}"></script>\n</body>\n</html>\n'
    open(fname, "w", encoding="utf-8").write(out)

def more(skip):
    tiles = "".join(f'<a href="{m["slug"]}.html"><span class="platewrap" style="--cut:22px"><span class="plate">{img(m["photo"], m["alt"], 600)}</span></span>{E(m["name"])}</a>'
                    for m in MARKETS if m["slug"] != skip)
    return f'<section class="mk-sec"><h2>More ways to deal</h2><div class="mk-more">{tiles}</div></section>'

GUIDE_FOR = {"machines": ("guide-sell-used-machine.html", "How to sell a used industrial machine in India"),
             "leasing": ("guide-lease-shed-warehouse.html", "Leasing an industrial shed or warehouse: what to check"),
             "storage": ("guide-lease-shed-warehouse.html", "Leasing an industrial shed or warehouse: what to check"),
             "agri": ("guide-barter-gst.html", "How business barter works in India, and how GST treats it")}
def guide_line(slug):
    g = GUIDE_FOR.get(slug)
    return f'<section class="mk-sec"><p class="guide-line">Guide: <a href="{g[0]}">{E(g[1])}</a></p></section>' if g else ""

BUYER_FORM = """
<section class="mk-sec" id="interest">
  <div class="mk-two" style="align-items:start">
    <div>
      <h2>Register your interest</h2>
      <p class="muted" style="max-width:46ch;line-height:1.6">Tell us what you want and where. We group you with other buyers who want the same in that area. A group moves ahead once enough buyers have joined to acquire land there.</p>
    </div>
    <div class="panel">
      <form id="btForm" name="buyer-group-interest" method="POST" data-netlify="true" netlify-honeypot="bot-field" novalidate>
        <input type="hidden" name="form-name" value="buyer-group-interest"><p class="sr"><label>Leave this empty <input name="bot-field" tabindex="-1" autocomplete="off"></label></p>
        <div class="row2">
          <div class="field" data-f="btType"><label for="btType">I want <span class="req">*</span></label>
            <select id="btType" name="property-type"><option value="">Choose a type</option><option>Shop</option><option>Showroom</option><option>Office</option><option>Flat</option><option>Villa or bungalow</option><option>Warehouse</option></select></div>
          <div class="field" data-f="btSize"><label for="btSize">Size (sq ft)</label><input id="btSize" name="size-sqft" type="number" min="50" inputmode="numeric" placeholder="e.g. 1,200"></div>
        </div>
        <div class="row2">
          <div class="field" data-f="btArea"><label for="btArea">Preferred area <span class="req">*</span></label><input id="btArea" name="preferred-area" type="text" placeholder="City and locality"></div>
          <div class="field" data-f="btBudget"><label for="btBudget"><span data-cur-only="INR">Budget (₹ lakh)</span><span data-cur-only="USD" hidden>Budget (US$)</span></label>
            <input id="btBudget" name="budget-lakh" type="number" min="1" inputmode="decimal" placeholder="e.g. 80"><input type="hidden" name="budget-entered" id="btBudgetEntered"></div>
        </div>
        <div class="row2">
          <div class="field" data-f="btName"><label for="btName">Your name <span class="req">*</span></label><input id="btName" name="name" type="text" autocomplete="name"></div>
          <div class="field" data-f="btEmail"><label for="btEmail">Email <span class="req">*</span></label><input id="btEmail" name="email" type="email" autocomplete="email"></div>
        </div>
        <div class="field"><label for="btPhone">Phone or WhatsApp</label><input id="btPhone" name="phone" type="tel" autocomplete="tel" placeholder="+91"></div>
        <p class="err" id="btErr" role="alert"></p>
        <button class="btn btn-primary" type="submit" style="width:100%">Register interest</button>
      </form>
      <div id="btDone" tabindex="-1" hidden><h3 style="margin-top:0">Interest registered</h3><p style="margin:0">We'll group you with other buyers who want the same in that area and email you when the group moves ahead.</p></div>
    </div>
  </div>
</section>"""

for m in MARKETS:
    steps = "".join(f"<li>{E(s)}</li>" for s in m["how"])
    who = "".join(f"<li>{E(s)}</li>" for s in m["who"])
    gain = "".join(f"<li>{E(s)}</li>" for s in m["gain"])
    explore = f"explore.html?v={m['v']}"
    body = f"""
<section class="mk-hero">
  <div>
    <p class="crumb"><a href="index.html#categories">What you need</a> · {E(m['name'])}</p>
    <h1>{E(m['promise'])}</h1>
    <p class="intro">{E(m['intro'])}</p>
    <div class="mk-actions"><a class="btn btn-primary" href="{E(m['post'])}">{E(m['cta'])}</a><a class="btn btn-ghost" href="{explore}">See live listings</a></div>
  </div>
  <div class="platewrap" style="--cut:64px"><span class="plate">{img(m['photo'], m['alt'], 1400, eager=True)}</span></div>
</section>
<section class="mk-sec"><h2>How it works</h2><ol class="mk-steps">{steps}</ol></section>
<section class="mk-sec"><div class="mk-two"><div><h2>Who it's for</h2><ul>{who}</ul></div><div class="mk-gain"><h2>What you gain</h2><ul>{gain}</ul></div></div></section>
{BUYER_FORM if m['slug'] == 'construction' else ''}
<section class="mk-sec"><h2>Live on DASKIES</h2><div id="mkListings" data-v="{m['v']}" data-groups="{E(m['groups'])}" data-post="{E(m['post'])}" data-cta="{E(m['cta'])}"><p class="muted">Loading listings…</p></div>
  <p class="small muted" style="margin-top:12px">Every listing is reviewed for completeness before it goes live. Do your own checks before any deal.</p></section>
<section class="mk-sec"><div class="mk-band"><div><h2>Pay in cash, as rent, or as a swap</h2><p>Every deal on DASKIES can be settled in cash, as rent, or as a straight swap (barter), with any difference paid in cash.</p></div><a class="btn btn-primary" href="account.html?mode=signup">Join DASKIES free</a></div></section>
{guide_line(m['slug'])}
{more(m['slug'])}
"""
    page(f"{m['slug']}.html", m["name"], f"{m['name']} on DASKIES: {m['promise']}.", body)

# ---------- Global buyers ----------
CLUSTERS = [("Auto components and bearings", "Rajkot, Ahmedabad, Sanand", ["Mundra", "Pipavav"]), ("Ceramic tiles and sanitaryware", "Morbi", ["Mundra", "Kandla"]),
  ("Brass parts and fittings", "Jamnagar", ["Mundra"]), ("Pumps, motors, castings, machine tools", "Rajkot, Ahmedabad", ["Mundra", "Pipavav"]),
  ("Chemicals, dyes and APIs", "Ankleshwar, Vapi, Dahej", ["Hazira", "Dahej"]), ("Textiles and denim", "Ahmedabad, Surat", ["Hazira", "Mundra"]),
  ("Pharma and healthcare", "Ahmedabad, Vadodara", ["Mundra"]), ("Spices, groundnut, dehydrated onion", "Unjha, Gondal, Mahuva", ["Mundra", "Pipavav"])]
def ports(c): return "".join('<span class="port2">' + E(p) + '</span>' for p in c)
rows = "".join("<tr><td>" + E(a) + "</td><td>" + E(b) + "</td><td>" + ports(c) + "</td></tr>" for a, b, c in CLUSTERS)
page("global-buyers.html", "Global buyers", "For importers in the US, Europe, the Gulf and Africa: lease running capacity or contract production in Gujarat, ship from Mundra.", f"""
<section class="mk-hero">
  <div>
    <p class="crumb"><a href="index.html">DASKIES</a> · Global buyers</p>
    <h1>Make it in Gujarat. Ship from Mundra.</h1>
    <p class="intro">For importers in the US, Europe, the Gulf and Africa: lease running capacity or contract production with Gujarat's exporters instead of building your own plant. Prices on DASKIES show in US dollars for visitors outside India.</p>
    <div class="mk-actions"><button class="btn btn-primary" type="button" data-req="Sourcing call with the Global Buyer Desk">Book a sourcing call</button><a class="btn btn-ghost" href="explore.html">See live listings</a></div>
  </div>
  <div class="platewrap" style="--cut:64px"><span class="plate">{img('1769837496184-32831581c55a', 'Container ships and cranes at a busy port', 1400, eager=True)}</span></div>
</section>
<section class="mk-sec"><h2>Four ways to work with India's manufacturers</h2><ol class="mk-steps" style="counter-reset:none">
  <li style="padding-left:18px"><b>Lease a running plant.</b> Factories with machinery, power and trained staff, on monthly or long-term terms.</li>
  <li style="padding-left:18px"><b>Contract manufacturing.</b> Parts and products made to your drawings and brand, from a pilot batch to full containers.</li>
  <li style="padding-left:18px"><b>Bulk sourcing.</b> Edible oils, groundnuts, cumin, castor oil, cotton and pulses, with grade and packing agreed in writing.</li>
  <li style="padding-left:18px"><b>One team, start to finish.</b> Video walkthroughs, site visits, samples, third-party inspection and export paperwork, in your time zone.</li>
</ol></section>
<section class="mk-sec"><h2>Where Gujarat makes it</h2>
  <div class="tablewrap"><table class="clusters2"><thead><tr><th scope="col">What's made</th><th scope="col">Where</th><th scope="col">Ports</th></tr></thead><tbody>{rows}</tbody></table></div>
  <p class="small muted" style="margin-top:12px;max-width:80ch">Leasing, contract manufacturing and investment by foreign companies in India follow FEMA and FDI rules. We introduce you to Indian lawyers, chartered accountants and customs brokers to structure the deal correctly.</p></section>
<section class="mk-sec"><div class="mk-band"><div><h2>The Global Buyer Desk</h2><p>Factory shortlists, video walkthroughs, site visits, samples and inspection for overseas buyers, on a retainer or per deal.</p></div><button class="btn btn-primary" type="button" data-req="Sourcing call with the Global Buyer Desk">Book a sourcing call</button></div></section>
{more('')}
""")

# ---------- Services ----------
SVC = [("Featured listings", "Put your listing at the top of its category and in the weekly digest sent to members.", "Sellers who want buyers this month"),
  ("Business verification", "We review your registration, GST and ownership documents and add a verification badge to your profile.", "Anyone dealing with new counterparties"),
  ("Deal manager", "A DASKIES manager finds the other party, values swaps, negotiates and handles paperwork until the deal is done.", "Larger or more complex deals"),
  ("Global Buyer Desk", "Factory shortlists, video walkthroughs, site visits, samples and inspection for overseas buyers, on a retainer or per deal.", "Importers in the US, Europe, the Gulf and Africa"),
  ("Valuation support", "No valuation report yet? We connect you with registered valuers for machinery, property and stock.", "Sellers listing for the first time"),
  ("Advertising and sponsorship", "Category sponsorship, banner placements and digest features for dealers, logistics firms, lenders and service providers.", "Businesses selling to Indian industry")]
cards = "".join(f'<div class="svc-card"><h3>{E(t)}</h3><p>{E(d)}</p><span class="for">For: {E(f)}</span><button class="btn btn-ghost btn-sm" type="button" data-req="{E(t)}">Request</button></div>' for t, d, f in SVC)
page("services.html", "Services", "Extra help from the DASKIES team: featured listings, business verification, deal managers, the Global Buyer Desk, valuation support and advertising.", f"""
<section class="mk-hero">
  <div>
    <p class="crumb"><a href="index.html">DASKIES</a> · Services</p>
    <h1>Extra help from the DASKIES team</h1>
    <p class="intro">Joining and your first listings are free. If you want more buyers, more trust, or someone to handle the deal for you, add a service. Price on request, based on deal size.</p>
    <div class="mk-actions"><a class="btn btn-primary" href="account.html?mode=signup">Join DASKIES free</a><a class="btn btn-ghost" href="pricing.html">See pricing</a></div>
  </div>
  <div class="platewrap" style="--cut:64px"><span class="plate">{img('1716191300020-b52dec5b70a8', 'A line of electrical equipment on a factory floor', 1400, eager=True)}</span></div>
</section>
<section class="mk-sec"><h2>Choose what you need</h2><div class="svc-cards">{cards}</div></section>
{more('')}
""")

# ---------- Partners ----------
page("partners.html", "Partner with DASKIES", "Brokers, chartered accountants, valuers, consultants and industry associations: refer businesses to DASKIES and earn a referral fee on every deal that closes.", f"""
<section class="mk-hero">
  <div>
    <p class="crumb"><a href="index.html">DASKIES</a> · Partners</p>
    <h1>Earn with DASKIES</h1>
    <p class="intro">Brokers, chartered accountants, valuers, consultants and industry associations already know who has idle assets and who needs them. Refer them to DASKIES and earn a referral fee on every deal that closes.</p>
    <div class="mk-actions"><button class="btn btn-primary" type="button" data-req="Partner programme">Become a partner</button></div>
  </div>
  <div class="platewrap" style="--cut:64px"><span class="plate">{img('1716191299945-4c5b89703971', 'A wide factory floor with yellow safety rails', 1400, eager=True)}</span></div>
</section>
<section class="mk-sec"><h2>How referrals work</h2><ol class="mk-steps">
  <li>Register as a partner and get your referral details.</li><li>Introduce a seller, buyer or overseas client to us.</li><li>We track the deal from listing to closing.</li><li>You're paid your referral fee when the deal closes.</li></ol>
  <p class="small muted" style="margin-top:12px">Referral fees are agreed in writing when you join.</p></section>
<section class="mk-sec"><h2>Who partners with us</h2><div class="mk-two"><ul><li>Property and machinery brokers</li><li>Chartered accountants</li><li>Registered valuers</li></ul><ul><li>Export consultants</li><li>Industry associations</li><li>Banks and NBFCs</li></ul></div></section>
{more('')}
""")
# ---------- Audience pages: startups and established businesses ----------
def ways(items):
    return "".join(f'<div class="svc-card"><h3>{E(t)}</h3><p>{E(d)}</p><a class="btn btn-ghost btn-sm" href="{E(h)}">{E(c)}</a></div>' for t, d, h, c in items)

def audience(fname, crumb, h1, intro, actions, photo_id, alt, skip, ways_title, items, steps, who, gain, band_t, band_p, band_btn, guides):
    lis = lambda xs: "".join(f"<li>{E(x)}</li>" for x in xs)
    g = "".join(f'<li><a href="{E(h)}">{E(t)}</a></li>' for h, t in guides)
    page(fname, crumb, intro, f"""
<section class="mk-hero">
  <div>
    <p class="crumb"><a href="index.html">DASKIES</a> · {E(crumb)}</p>
    <h1>{E(h1)}</h1>
    <p class="intro">{E(intro)}</p>
    <div class="mk-actions">{actions}</div>
  </div>
  <div class="platewrap" style="--cut:64px"><span class="plate">{img(photo_id, alt, 1400, eager=True)}</span></div>
</section>
<section class="mk-sec"><h2>{E(ways_title)}</h2><div class="svc-cards">{ways(items)}</div></section>
<section class="mk-sec"><h2>How it works</h2><ol class="mk-steps">{lis(steps)}</ol></section>
<section class="mk-sec"><div class="mk-two"><div><h2>Who it's for</h2><ul>{lis(who)}</ul></div><div class="mk-gain"><h2>What you gain</h2><ul>{lis(gain)}</ul></div></div></section>
<section class="mk-sec"><div class="mk-band"><div><h2>{E(band_t)}</h2><p>{E(band_p)}</p></div>{band_btn}</div></section>
<section class="mk-sec"><h2>Guides worth reading first</h2><ul class="guide-links">{g}</ul></section>
{more(skip)}
""")

STEPS = ["Join free and add your business details. Every member does, so you know who you're dealing with.",
         "Post what you have or what you need, or search what others have listed.",
         "Message businesses privately through DASKIES. Contact details stay private until you both choose to share them.",
         "Agree terms in a deal room. Nothing is binding until every party approves the same terms."]

audience("for-startups.html", "For startups", "Start making without buying a factory",
  "Most of a new manufacturer's money goes into land, sheds and machines before the first sale. On DASKIES you can lease capacity that already exists, buy proven used machines, rent storage only when you need it, and swap what you make for what you need.",
  '<a class="btn btn-primary" href="account.html?mode=signup">Join DASKIES free</a><a class="btn btn-ghost" href="post.html?kind=need">Post what you need</a>',
  "1716191300020-b52dec5b70a8", "A line of electrical equipment on a factory floor", "",
  "Six ways to start lean", [
    ("Lease a line, a shed or a spare shift", "Rent factory space, a running production line or a second shift by the month, instead of building your own.", "leasing.html", "See industrial leasing"),
    ("Contract manufacturing and job work", "Have parts or products made to your drawings by factories that have idle machines and trained staff.", "leasing.html", "Find capacity"),
    ("Buy proven used machines", "Get machines for less than new, inspect them before you pay, or rent them first.", "machines.html", "See used machines"),
    ("Rent storage only when you need it", "Short or long-term warehouse, cold storage and tank space near ports, farms and industrial areas.", "storage.html", "See storage"),
    ("Swap instead of paying cash", "Trade your products or services for machines, space or stock. Any gap in value is settled in cash.", "guide-barter-gst.html", "How barter works"),
    ("License technology and know-how", "License software, designs or processes from companies that already have them, instead of building from zero.", "technology.html", "See technology")],
  STEPS,
  ["Hardware and product startups", "D2C brands that need a manufacturer", "Food and agri-processing startups", "Exporters testing a new product"],
  ["Spend on growth, not on buildings", "Start production in weeks, not years", "Test a product before you commit to machines", "Keep cash by swapping instead of paying"],
  "Tell us what you need", "Post a requirement in a few minutes. Businesses that have it can reply to you directly through DASKIES.",
  '<a class="btn btn-primary" href="post.html?kind=need">Post a need</a>',
  [("guide-barter-gst.html", "How business barter works in India, and how GST treats it"), ("guide-lease-shed-warehouse.html", "Leasing an industrial shed or warehouse: what to check")])

audience("for-businesses.html", "For established businesses", "Make idle assets earn again",
  "Every established business has something standing still: a machine replaced by a newer one, a shed half empty, a second shift that never started, stock that didn't sell. DASKIES puts these in front of businesses that need them, in India and abroad, for cash, rent or a swap.",
  '<a class="btn btn-primary" href="post.html?kind=offer">List what you have</a><a class="btn btn-ghost" href="explore.html">See what others need</a>',
  "1787039467622-ddec5c24320c", "CNC machines in a bright workshop", "machines",
  "What you can put to work", [
    ("Sell, rent out or swap old machines", "Release the cash locked in machines you no longer use, or swap them for ones you need.", "machines.html", "See used machines"),
    ("Rent out empty sheds and floors", "Turn unused factory space into monthly rent from companies that need capacity now.", "leasing.html", "See industrial leasing"),
    ("Fill spare shifts with job work", "Use idle machines and staff for contract manufacturing for other companies.", "leasing.html", "List spare capacity"),
    ("Rent out warehouse space", "Earn from empty warehouse, cold storage or tank space, short or long-term.", "storage.html", "See storage"),
    ("Reach overseas buyers", "Importers in the US, Europe, the Gulf and Africa look for running capacity and contract production in Gujarat.", "global-buyers.html", "See Global buyers"),
    ("Donate what you no longer need", "Give old computers, machines, tools or training to schools and skill centres.", "technology.html", "See technology and education")],
  STEPS,
  ["Family-run manufacturers and MSMEs", "Factories upgrading or closing a line", "Traders with surplus or seasonal stock", "Owners of industrial land and buildings"],
  ["Cash or rent from things that earn nothing today", "Buyers who give their full business details", "Swaps when cash is tight, with any difference paid in cash", "A deal manager for larger deals, if you want one"],
  "Not sure what it's worth?", "We connect you with registered valuers for machinery, property and stock, so you can list with a value buyers trust.",
  '<a class="btn btn-primary" href="services.html">See valuation support</a>',
  [("guide-sell-used-machine.html", "How to sell a used industrial machine in India"), ("guide-lease-shed-warehouse.html", "Leasing an industrial shed or warehouse: what to check"), ("guide-barter-gst.html", "How business barter works in India, and how GST treats it")])

print("built", [m["slug"] for m in MARKETS] + ["global-buyers", "services", "partners", "for-startups", "for-businesses"])
