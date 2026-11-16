#!/usr/bin/env python3
"""Builds the Guides hub (guides.html) and the guide articles, and writes tools/guides.json for tools/seo.py.

Run from the repo root:  python3 tools/build_guides.py   (then tools/seo.py and tools/stamp.py)
Guides are general information for Indian businesses, written from the sources listed at the end of each one.
"""
import html, json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
E = html.escape

def head(title, desc):
    tpl = open("about.html", encoding="utf-8").read().split("<body>")[0]
    tpl = re.sub(r"<title>.*?</title>", f"<title>{E(title)}</title>", tpl, flags=re.S)
    tpl = re.sub(r'<meta name="description" content=".*?">', f'<meta name="description" content="{E(desc)}">', tpl)
    return tpl

def write(fname, title, desc, body):
    ver = re.search(r"page\.js\?v=([0-9a-f]+)", open("about.html", encoding="utf-8").read()).group(1)
    out = head(title, desc) + '<body>\n<main class="wrap" id="main" tabindex="-1">\n' + body.strip() + \
        f'\n</main>\n<script type="module" src="assets/marketing.js?v={ver}"></script>\n</body>\n</html>\n'
    open(fname, "w", encoding="utf-8").write(out)

NOTE = ("This guide is general information for Indian businesses, not tax or legal advice. Rules and rates change; "
        "check with your chartered accountant or lawyer before you sign or file anything.")

GUIDES = [
dict(file="guide-barter-gst.html", label="Barter and GST",
  h1="How business barter works in India, and how GST treats it",
  seo_title="Business barter in India and GST: how swaps are taxed and invoiced | DASKIES",
  description="Swapping goods or services between businesses is a taxable supply under GST. How each side values and invoices its part, what happens in three- and four-party swaps, and the paperwork to keep.",
  lead="Swapping a machine for stock, or warehouse space for finished goods, keeps cash in the business. Under GST, though, a swap is not tax-free: each side is making a sale. Here is how it works in practice.",
  date="2026-11-16",
  body="""
<h2>What counts as barter</h2>
<p>Barter is paying for something with goods or services instead of money. In Indian industry it often looks like a used machine given for a quantity of raw material, factory space given for finished products, or job work paid for with stock. Many swaps are partly cash: if one side's goods are worth more, the other side pays the difference.</p>
<p>On DASKIES, swaps can involve two, three or four businesses. In a three-party swap, A gives to B, B gives to C, and C gives back to A, with any gaps settled in cash.</p>

<h2>Under GST, each side of a swap is a supply</h2>
<p>Section 7(1)(a) of the CGST Act, 2017 defines "supply" to include barter and exchange made for consideration in the course of business. "Consideration" covers payment in money <em>or otherwise</em>. So when two registered businesses swap, there are two taxable supplies: each business supplies its goods or services to the other, and each one is liable for GST on what it gives.</p>
<p>In practice this means two tax invoices, one from each side, and two GST payments to the government. Even in a pure swap with no cash changing hands, plan the cash for the GST each side owes.</p>

<h2>What value goes on the invoice</h2>
<p>Normally GST is charged on the price paid. When the price is not wholly in money, Rule 27 of the CGST Rules sets the order for finding the value:</p>
<ol>
  <li>the open market value of the supply;</li>
  <li>if that is not available, the cash paid plus the money value of the non-cash part, if that value is known at the time of supply;</li>
  <li>if that is not available, the value of goods or services of like kind and quality;</li>
  <li>failing those, the cost-based or residual methods in Rules 30 and 31.</li>
</ol>
<p>The simplest way to stay on safe ground is to agree, in writing, a market value for each item in the swap before anything moves, backed by recent prices, quotes or a valuation report.</p>

<h2>A worked example</h2>
<p>Firm A gives Firm B a used CNC machine. Both agree its market value is ₹45 lakh. Firm B gives Firm A groundnut oil with a market value of ₹36 lakh, and pays ₹9 lakh in cash to settle the difference.</p>
<ul>
  <li>Firm A issues a tax invoice for the machine at ₹45 lakh, plus GST at the rate that applies to that machine.</li>
  <li>Firm B issues a tax invoice for the oil at ₹36 lakh, plus GST at the rate that applies to that oil.</li>
  <li>The ₹9 lakh cash payment settles the difference in value.</li>
  <li>Each firm can claim input tax credit for the GST on what it received, if it is otherwise eligible.</li>
</ul>
<p>If Firm A claimed input tax credit when it bought the machine, a special rule applies when it supplies the machine onward. See <a href="guide-sell-used-machine.html">How to sell a used industrial machine in India</a>.</p>

<h2>Three- and four-party swaps</h2>
<p>A chain of swaps is a set of separate supplies. Each business invoices the business it gives to, at the agreed value. Agree all the values and the cash adjustments in one written agreement signed by every party, so the invoices match and nobody is left carrying a gap.</p>

<h2>Income tax</h2>
<p>For income tax, a swap is still a transfer, and your books should record it at a fair value. Whether the result is business income or a capital gain depends on whether the item was stock-in-trade or a capital asset. Your chartered accountant will advise on the treatment for your case.</p>

<h2>Paperwork to keep</h2>
<ul>
  <li>A written barter agreement listing every item, its agreed value, who gives what to whom, and any cash adjustment.</li>
  <li>A tax invoice from each side.</li>
  <li>E-way bills where goods move and the rules require them.</li>
  <li>Delivery confirmations signed by the receiving side.</li>
  <li>The basis for each value: quotes, price lists or a valuation report.</li>
</ul>

<h2>How DASKIES helps</h2>
<p>DASKIES finds businesses whose needs fit together, including three- and four-party chains, and gives you a deal room where every party approves the same terms. The deal room fills templates for an offer sheet, an MOU and a barter agreement from the agreed terms. DASKIES does not hold money or goods; payments and deliveries happen directly between the parties.</p>
""",
  sources=[("CBIC: GST valuation rules (Rule 27, value where consideration is not wholly in money)", "https://cbic-gst.gov.in/valuation-rules.html"),
           ("iPleaders: barter transactions under GST, section 7(1)(a) and Rule 27", "https://blog.ipleaders.in/barter-transactions-goods-exchange-goods/"),
           ("TaxGuru: taxability of barter and exchange under GST", "https://taxguru.in/goods-and-service-tax/taxability-barter-exchange-gst.html")]),

dict(file="guide-sell-used-machine.html", label="Selling a used machine",
  h1="How to sell a used industrial machine in India",
  seo_title="How to sell a used industrial machine in India: a practical checklist | DASKIES",
  description="Papers to gather, clearing a bank's charge, getting a valuation, listing with the right photos, the GST rule for capital goods on which you took input tax credit, and the paperwork on sale.",
  lead="An idle machine loses value every month it stands still. Selling it well takes a little preparation: clear papers, a fair value, an honest listing and the right tax treatment.",
  date="2026-11-16",
  body="""
<h2>1. Gather the machine's papers</h2>
<p>Buyers trust a machine with a history. Collect the purchase invoice, the nameplate details (make, model, serial number and year), manuals and drawings, service and repair records, and any test or calibration certificates. Note what goes with the machine: tooling, spares, attachments and software licences.</p>

<h2>2. Make sure you can sell it</h2>
<p>If the machine was bought on a loan or is hypothecated to a bank or NBFC, you will need the lender's no-objection or release before the sale. If the machine sits in a leased shed, check whether the lease says anything about removing plant.</p>

<h2>3. Get a fair value</h2>
<p>Start with what similar machines sell for, and quotes from dealers. For a figure that buyers and banks will accept, use a valuer. The Insolvency and Bankruptcy Board of India registers valuers under the Companies (Registered Valuers and Valuation) Rules, 2017, and "Plant and Machinery" is one of the three asset classes they are registered for. A valuation report also gives you a solid basis if you later swap the machine instead of selling it.</p>

<h2>4. List it properly</h2>
<ul>
  <li>At least three clear photos: the whole machine, a close-up of its condition, and the nameplate. A short video of it running helps more than anything else.</li>
  <li>Specifications and capacity, power requirement, and current condition, stated honestly.</li>
  <li>Where it is, whether it is running or dismantled, and who will handle dismantling and loading.</li>
  <li>Your price, or "price on request", and whether you would rent it out or swap it.</li>
</ul>

<h2>5. Know the GST on the sale</h2>
<p>A registered business selling a used machine charges GST on the sale at the rate that applies to that machine. There is one extra rule to check. If you claimed input tax credit when you bought the machine, section 18(6) of the CGST Act says you must pay the <em>higher</em> of:</p>
<ul>
  <li>the input tax credit you took, reduced by 5 percentage points for every quarter (or part of a quarter) since the purchase invoice; or</li>
  <li>the GST on the price you are selling it for.</li>
</ul>
<p><b>Example.</b> You took ₹1,80,000 of input tax credit on a machine and sell it six quarters later. The credit is reduced by 30 percentage points, leaving ₹1,26,000. You sell the machine for ₹5,00,000; at an 18% rate, the GST on that price is ₹90,000. You pay the higher figure, ₹1,26,000. Your chartered accountant will confirm the method and rate for your machine.</p>

<h2>6. Agree the terms in writing</h2>
<ul>
  <li>Price, and exactly what is included.</li>
  <li>Inspection: let serious buyers see it in person or on a video call before they commit.</li>
  <li>Delivery terms (for example, ex-works your factory), and who pays for dismantling, loading and transport.</li>
  <li>Payment schedule, such as an advance with the order and the balance before dispatch.</li>
  <li>Warranty, if any. Used machines are often sold "as is, where is"; say so clearly.</li>
</ul>

<h2>7. Paperwork on the sale</h2>
<ul>
  <li>A tax invoice to the buyer.</li>
  <li>An e-way bill where the rules require one for moving the machine.</li>
  <li>A delivery note signed by the buyer.</li>
  <li>An update to your fixed asset register.</li>
</ul>

<h2>Selling isn't the only option</h2>
<p>If you may need the machine again, renting it out brings in money while you keep it. If you need something else more than cash, a swap can work better than a sale. On DASKIES, buyers looking for that category see your listing, and a deal room keeps offers and terms in one place.</p>
""",
  sources=[("IBBI: FAQs on registration as a valuer (asset classes include Plant and Machinery)", "https://ibbi.gov.in/uploads/register/FAQs_for_registration_of_Individuals_as_valuer.pdf"),
           ("Lakshmikumaran & Sridharan: ITC reversal on sale of used capital goods, section 18(6)", "https://www.lkslaw.com/insights/articles/itc-reversal-on-sale-of-used-capital-goods-1/"),
           ("TaxGuru: GST payable on sale of capital goods, section 18(6), Rules 40(2) and 44(6)", "https://taxguru.in/?p=916394")]),

dict(file="guide-lease-shed-warehouse.html", label="Leasing a shed or warehouse",
  h1="Leasing an industrial shed or warehouse in India: what to check",
  seo_title="Leasing an industrial shed or warehouse in India: checklist for owners and tenants | DASKIES",
  description="Title and permission to sub-let (including GIDC estates), permitted use and approvals, power, registering leases longer than a year, rent terms, and GST on industrial rent.",
  lead="Renting out an empty shed brings in steady income, and renting one saves years of building. Both sides do better when these points are checked before the keys change hands.",
  date="2026-11-16",
  body="""
<h2>Title, and permission to let</h2>
<p>The person letting the property must have the right to do so. Ask for the title documents or, if the owner is itself a tenant, the head lease and the landlord's consent to sub-let.</p>
<p>In industrial estates run by a state corporation the land is usually held on a lease from that corporation, and its rules apply. In Gujarat, GIDC requires its permission to sub-let a plot or shed and charges a yearly sub-letting fee (listed by GIDC as 3% of the prevailing allotment price per year). GIDC does not allow sub-letting where there is unauthorised construction or use on the plot. Other states' industrial corporations have similar rules, so check before you sign.</p>

<h2>Permitted use and approvals</h2>
<ul>
  <li>Is the building approved for the use the tenant has in mind: manufacturing, warehousing, or both?</li>
  <li>Fire safety approval for the building and the goods to be stored or processed.</li>
  <li>Pollution control board consent for the tenant's activity, where it needs one. In Gujarat that is the Gujarat Pollution Control Board.</li>
</ul>

<h2>Power, water and access</h2>
<ul>
  <li>The sanctioned electricity load, and whether it covers the tenant's machines. Increasing load takes time and money; agree who pays.</li>
  <li>Water supply and effluent arrangements.</li>
  <li>Truck access, loading docks, door height, floor load and clear height inside.</li>
</ul>

<h2>Put it in writing, and register longer leases</h2>
<p>Under section 17(1)(d) of the Registration Act, 1908, read with section 107 of the Transfer of Property Act, 1882, a lease of immovable property from year to year, for any term longer than one year, or reserving a yearly rent must be made by a registered document, with stamp duty paid. Many short lets are written for 11 months for this reason. A longer registered lease gives both sides firmer protection.</p>

<h2>Rent terms to agree</h2>
<ul>
  <li>Rent, the yearly increase, and the security deposit.</li>
  <li>Lock-in period and notice period for each side.</li>
  <li>Who pays maintenance, property tax, insurance and the industrial estate's charges.</li>
  <li>Fit-out by the tenant, and whether the space must be restored at the end.</li>
  <li>What happens to machines and stock if the lease ends early.</li>
</ul>

<h2>GST on industrial rent</h2>
<p>Renting out non-residential property, including industrial sheds and godowns, is a taxable service under GST at 18% (service code 9972). A registered landlord charges GST on the rent. If the landlord is not registered and the tenant is, the tenant may have to pay the GST under reverse charge, a rule in force since October 2024. Renting out a godown is different from providing storage services for agricultural produce, which can be exempt; your chartered accountant can tell you which applies.</p>

<h2>Inspect before you sign</h2>
<p>Walk the property in daylight and, if you can, after rain. Look at the roof, drainage, floor cracks, wiring, earthing and security. Photograph everything on the day the tenant takes possession and attach the photos to the lease; it saves arguments about the deposit later.</p>

<h2>How DASKIES helps</h2>
<p>Owners list empty sheds, floors and warehouse space with size, power and rent; businesses looking for that place and size see them. Tenants can post what they need. Every member gives full business details, and a deal room keeps the offer, counteroffers and agreed terms in one place.</p>
""",
  sources=[("GIDC: allotment of properties, including sub-letting fees", "https://gidc.gujarat.gov.in/Pages/Contents/allotment%20of%20properties"),
           ("GIDC: sub-letting application conditions", "https://gidc.gujarat.gov.in/pdf/Application/Sublet.pdf"),
           ("Registration Act, 1908, section 17 (Income Tax Department)", "https://www.incometaxindia.gov.in/w/section-17-199"),
           ("Conventus Law: registration of lease deeds under the Registration Act and Transfer of Property Act", "https://conventuslaw.com/report/india-time-is-of-the-essence-for-registration-of-a/"),
           ("Gujarat AAR, Rishi Shipping: warehouse space rental classified under SAC 9972 at 18%", "https://www.patronaccounting.com/case-laws/aar/m-s-rishi-shipping-guj-gaar-ruling-2018-4-dt-20-03-2018"),
           ("Taxheal: godown renting taxable at 18%, reverse charge on rent from unregistered landlords from 10 October 2024", "https://www.taxheal.com/?p=143425")]),
]

def day(d):
    import datetime
    x = datetime.date.fromisoformat(d)
    return f"{x.day} {x.strftime('%B %Y')}"

def phead(crumb, h1, lead, extra=""):
    return f'<div class="phead"><div class="phead-in"><p class="crumb">{crumb}</p><h1>{E(h1)}</h1><p class="plead">{E(lead)}</p>{extra}</div></div>'

for g in GUIDES:
    others = "".join(f'<li><a href="{x["file"]}">{E(x["h1"])}</a></li>' for x in GUIDES if x is not g)
    src = "".join(f'<li><a href="{E(u)}" rel="noopener" target="_blank">{E(t)}</a></li>' for t, u in g["sources"])
    body = f"""
{phead('<a href="index.html">DASKIES</a> · <a href="guides.html">Guides</a>', g['h1'], g['lead'], f'<p class="pmeta">DASKIES guide · {day(g["date"])}</p>')}
<article class="doc guide">
{g['body'].strip()}
<p class="note">{E(NOTE)}</p>
<h2>Sources</h2>
<ul class="sources">{src}</ul>
</article>
<section class="mk-sec"><div class="mk-band"><div><h2>Have something to lease, sell or swap?</h2><p>Join DASKIES free. List what you have or post what you need, and talk to businesses privately.</p></div><a class="btn btn-primary" href="account.html?mode=signup">Join DASKIES free</a></div></section>
<section class="mk-sec"><h2>More guides</h2><ul class="guide-links">{others}</ul></section>
"""
    write(g["file"], g["seo_title"], g["description"], body)

cards = "".join(f'<div class="svc-card"><h3><a href="{g["file"]}">{E(g["h1"])}</a></h3><p>{E(g["description"])}</p><a class="btn btn-ghost btn-sm" href="{g["file"]}">Read the guide</a></div>' for g in GUIDES)
write("guides.html", "Guides", "Guides for Indian businesses", f"""
{phead('<a href="index.html">DASKIES</a> · Guides', 'Guides for Indian businesses', 'Plain, practical guides on swapping, selling and leasing industrial assets in India, with the rules that apply and links to the sources.')}
<section class="mk-sec" style="border-top:0;padding-top:8px"><div class="svc-cards">{cards}</div></section>
<section class="mk-sec"><div class="mk-band"><div><h2>Who DASKIES is for</h2><p>New businesses that want to start without big capital spending, and established businesses with machines, space or stock standing idle.</p></div><div class="mk-actions"><a class="btn btn-primary" href="for-startups.html">For startups</a><a class="btn btn-line" href="for-businesses.html">For established businesses</a></div></div></section>
""")

json.dump([{k: g[k] for k in ("file", "label", "h1", "seo_title", "description", "date")} for g in GUIDES], open("tools/guides.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("guides:", [g["file"] for g in GUIDES] + ["guides.html"])
