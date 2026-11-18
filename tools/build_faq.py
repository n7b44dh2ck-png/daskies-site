#!/usr/bin/env python3
"""Builds faq.html: every common question answered in full, grouped by topic,
with FAQPage structured data for search engines. Run before seo.py, perf.py and stamp.py."""
import html, json, os, re
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
E = html.escape

FAQ = [
("About DASKIES", [
 ("What is DASKIES?",
  "DASKIES is a business network for Indian industry, based in Ahmedabad. Businesses use it to lease out, sell or swap what they have standing idle, such as factory sheds, machines, warehouse space, spare production shifts, bulk commodities and technology, and to find what they need without buying it outright. Every deal can be paid in cash, as rent, or as a swap with any difference settled in cash."),
 ("Who is DASKIES for?",
  "Two kinds of businesses. Providers have something to offer: factories, landowners, warehouse and cold-store owners, traders, machinery owners and technology owners. Receivers need something: manufacturers who need capacity, startups that can't yet buy a plant, traders, and overseas importers looking for Indian suppliers. Many businesses are both, and can list what they have and post what they need from the same account."),
 ("Is DASKIES a broker?",
  "No. DASKIES is a network where members find each other and deal directly. We don't own the assets, set the prices or hold anyone's money. If you want help, our team can find the other party, value a swap and manage the deal for you as a paid service, but using DASKIES on your own is always possible."),
 ("Where does DASKIES work?",
  "Our office is in Ahmedabad, Gujarat, and most of our first members are Gujarat businesses. Members can list anywhere in India, and overseas buyers use DASKIES through the Global Buyer Desk to lease capacity or source products from Indian factories."),
]),
("Joining and listing", [
 ("How do I join?",
  "Choose Join free and create an account with your email. Before you post, enquire or message, you complete your business profile: your full name, mobile number, business name, what your business does, registered address, city, state, PIN and country. GSTIN is optional. Your address, PIN, GSTIN and mobile are visible only to you and the DASKIES team."),
 ("What can I list?",
  "Anything in our six categories: industrial leasing (sheds, plots, production lines, spare shifts), used machines, storage and warehousing, agriculture and commodities, construction at cost through buyer groups, and technology and education. You can post an offer (something you have) or a requirement (something you need)."),
 ("How do I post a listing?",
  "Choose List an asset or Post a need, pick the category and fill in the details: what it is, its size or capacity, location, price or rent, photos, and what you would take in exchange. Each category asks for the details buyers in that category compare, for example tonnage for presses or FFA and moisture for edible oils. Then send it for review."),
 ("How does the review work?",
  "Our team checks every listing for completeness before it goes live, so members see real, complete listings. You get an alert in your account as soon as your listing is approved, or a note telling you what to add or correct."),
 ("Can DASKIES list it for me?",
  "Yes. If you'd rather not fill in the form, send us the details and a few photos on WhatsApp or by email and, with your permission, our team will post it for you. These listings show \"Listed by DASKIES\", and enquiries come to us first, so your number stays private until you choose to share it."),
 ("How many listings can I post for free?",
  "A free account can post up to two listings and browse and search every listing on DASKIES. Full membership removes the limit and adds unlimited enquiries and messages, barter matching and deal rooms."),
 ("Can I edit or close my listing?",
  "Yes, at any time from your dashboard. Close it when the asset is leased or sold, so other members only see what is still available."),
]),
("Finding and making a deal", [
 ("How do I contact the other business?",
  "Open a listing and send an enquiry. The conversation happens in DASKIES messages, so neither side has to share a phone number or email until they want to. You see the other business's name, city and verification level before you write."),
 ("What is a deal room?",
  "When both sides want to go ahead, the deal moves into a deal room. There you make numbered offers and counteroffers, and terms are only agreed when every party approves the same version. A tracker shows each stage, from enquiry to signed contract and completion, and document templates such as an offer sheet, MOU and barter agreement give you a starting point."),
 ("How does a barter deal work?",
  "Each side agrees a value for what it gives. If the values differ, the difference is paid in cash: for example, you trade in a machine worth ₹50 lakh for one worth ₹65 lakh and pay ₹15 lakh. When two businesses can't swap directly, DASKIES looks for a chain of three or four members where everyone gets what they need."),
 ("Is barter taxed under GST?",
  "Generally yes. In a business-to-business swap, each side is usually treated as making a taxable supply at an agreed value, so both sides invoice and pay GST as they would for a sale. Our <a href=\"guide-barter-gst.html\">guide on barter and GST</a> explains the basics; your chartered accountant, or one on the DASKIES panel, can confirm the treatment for your deal."),
 ("Can I inspect a machine or a shed before I agree?",
  "Yes, and you should. Arrange a site visit or inspection through the deal room before you sign. Overseas buyers can ask the Global Buyer Desk for video walkthroughs, samples and third-party inspection."),
 ("What happens if the other party doesn't pay or deliver?",
  "DASKIES doesn't hold money and doesn't offer escrow, so the contract you sign with the other business is what protects you. Protect yourself the way you would in any business deal: pay in stages tied to delivery, inspect before you accept, use a letter of credit for exports, and have the contract checked, by your own advocate or one on the DASKIES panel. If a member breaks their terms, report them; we review every report and can suspend members who misuse DASKIES."),
]),
("Fees and payments", [
 ("What does DASKIES cost?",
  "Joining is free. Full membership costs ₹15,000 + GST for 90 days and opens unlimited listings, enquiries and messages, barter matching and deal rooms. A success fee applies only when a deal contract is signed through DASKIES; each party sees its own fee in the deal room before signing, and nothing is charged if there is no deal. See <a href=\"pricing.html\">Pricing</a> for what membership includes."),
 ("How do I pay?",
  "Online through Razorpay, by UPI, debit or credit card, net banking, EMI or wallet. DASKIES never sees or stores your card details."),
 ("Do I get a GST invoice?",
  "Yes. A GST invoice is created automatically for every payment and is available in your dashboard to view, print or save as a PDF."),
 ("Can I get a refund?",
  "Membership and success fees are not refundable. If you were charged by mistake or charged twice, we refund it. The <a href=\"refunds.html\">Refunds and cancellations</a> page has the details."),
]),
("Trust and safety", [
 ("How do I know a member is genuine?",
  "Every member gives full business details before they can post or deal. Each profile shows how far it has been checked: registered, documents submitted, documents reviewed, or business verified. Prefer verified members for larger deals, and check documents yourself before you sign."),
 ("Does DASKIES guarantee listings?",
  "No. We check listings for completeness, but we can't guarantee any listing, member or outcome. Always do your own checks, inspect before you buy, and take advice before you sign."),
 ("Who can see my details?",
  "Only you and the DASKIES team can see your address, PIN, GSTIN, mobile and email. Other members see your business name, city and verification level, and reach you through DASKIES messages until you decide to share your number."),
 ("How do I report a problem?",
  "On a listing, choose Report this listing and tell us what is wrong. For anything else, such as a member who broke agreed terms, write to info@daskies.com or WhatsApp us. Our team reviews every report."),
]),
("Legal and tax paperwork", [
 ("Can DASKIES handle the legal paperwork?",
  "Yes, if you need it. Advocates and chartered accountants on the DASKIES panel prepare and check lease deeds, leave and licence agreements, sale and swap agreements, title documents, stamp duty, registration and GST. It is optional, and the fee is quoted per deal before any work starts. Tick the paperwork box when you post, or ask for a quote on any category page."),
 ("Why should I get the paperwork checked?",
  "A missing permission or an unclear clause can cost far more than the deal earns: a sub-lease the estate doesn't allow, a machine with a bank loan still on it, or a swap invoiced at the wrong value. Having an advocate or CA check the documents before you sign avoids most of these problems."),
]),
("For buyers outside India", [
 ("Can a foreign company use DASKIES?",
  "Yes. Overseas importers and brands use the <a href=\"global-buyers.html\">Global Buyer Desk</a> to find Indian factories for contract manufacturing, to lease running capacity, and to source products in bulk. Prices can be shown in US dollars."),
 ("Can a foreign company lease a factory in India?",
  "Usually yes, within India's FEMA and FDI rules. The right structure depends on your country, your sector and how long you need the capacity, so take advice before you sign. Advocates and chartered accountants on the DASKIES panel can set up and check the paperwork."),
]),
]

def slug(t): return "".join(ch.lower() if ch.isalnum() else "-" for ch in t).strip("-").replace("--", "-")

toc = "".join(f'<a href="#{slug(g)}">{E(g)}</a>' for g, _ in FAQ)
groups = ""
for g, qs in FAQ:
    items = "".join(f'<details><summary>{E(q)}</summary><p>{a}</p></details>' for q, a in qs)
    groups += f'<section class="faqgroup" id="{slug(g)}"><h2>{E(g)}</h2><div class="faq2">{items}</div></section>\n'
ld = {"@context": "https://schema.org", "@type": "FAQPage",
      "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": re.sub(r"<[^>]+>", "", a)}} for _, qs in FAQ for q, a in qs]}

out = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="assets/boot.js"></script>
<script src="assets/fx.js"></script>
<title>FAQ</title>
<meta name="description" content="">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/app.css">
</head>
<body>
<main class="wrap doc" id="main" tabindex="-1">
<div class="phead"><div class="phead-in">
<h1>Questions businesses ask us</h1>
<p class="plead">Everything about how DASKIES works: joining, listing, making a deal, fees, safety and paperwork. Can't find your answer? WhatsApp us or write to info@daskies.com.</p>
</div></div>
<nav class="faqtoc" aria-label="Topics">{toc}</nav>
{groups}<p class="faqmore">Still have a question? <a href="contact.html">Contact us</a> or <a href="index.html?req=A%20question%20about%20DASKIES#contact">ask our team</a>.</p>
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</main>
<script type="module" src="assets/page.js"></script>
</body>
</html>
'''
open("faq.html", "w", encoding="utf-8").write(out)
print("faq.html:", sum(len(q) for _, q in FAQ), "questions")
