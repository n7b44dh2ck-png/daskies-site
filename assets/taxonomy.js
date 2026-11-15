// DASKIES six verticals, their subcategories and the extra fields each listing form asks for.
// Field: [key, label, type, options?]  type: text | number | select | textarea | yesno

const INCOTERMS = ["Ex-works / ex-factory", "Ex-warehouse", "Ex-tank", "FOB", "CFR", "CIF", "Delivered"];

export const VERTICALS = [
  {
    id: "industrial", name: "Industrial Exchange", short: "Industrial",
    blurb: "Machines, factories, spare capacity and equipment to sell, lease or swap.",
    groups: {
      "Industrial machinery": ["Manufacturing machinery", "Processing machinery", "Packaging machinery", "Food processing equipment", "Textile machinery", "Oil mill machinery", "Crushing and refining equipment", "Boilers and turbines", "Generators and electrical equipment", "Material handling machinery", "CNC and fabrication equipment", "Used and refurbished machinery"],
      "Industrial properties": ["Factories", "Industrial sheds", "Manufacturing units", "Industrial plots", "Workshops", "Production facilities", "Industrial buildings"],
      "Industrial capacity": ["Idle manufacturing capacity", "Contract manufacturing", "Job work", "Toll processing", "Production line availability", "Processing capacity", "Factory utilisation partnerships"],
      "Equipment leasing": ["Short-term leasing", "Long-term leasing", "Machinery rental", "Equipment hire", "Lease-to-own"]
    },
    fields: [
      ["manufacturer", "Manufacturer", "text"], ["model", "Model", "text"], ["year", "Year made", "number"],
      ["condition", "Condition", "select", ["New", "Like new", "Good", "Needs repair", "For parts"]],
      ["specs", "Capacity and technical specifications", "textarea"],
      ["ownership", "Ownership", "select", ["Owned outright", "Under loan / hypothecated", "Leased", "Representing the owner"]],
      ["availability", "Available from", "text"], ["inspection", "Inspection possible", "yesno"]
    ]
  },
  {
    id: "commodity", name: "Commodity Exchange", short: "Commodities",
    blurb: "Bulk edible oils, oilseeds, meals, grains and metals, buy and sell.",
    groups: {
      "Edible oils": ["Soybean crude oil", "Soybean degummed oil", "Refined soybean oil", "Crude palm oil", "Refined palm oil", "Sunflower oil", "Mustard oil", "Rice bran oil", "Other edible oils"],
      "Oilseeds": ["Soybeans", "Mustard seeds", "Sunflower seeds", "Groundnuts", "Other oilseeds"],
      "Oilseed by-products": ["Soybean de-oiled cake", "Mustard DOC", "Groundnut DOC", "Rice bran DOC", "Other protein meals"],
      "Agricultural commodities": ["Grains", "Pulses", "Seeds", "Feed ingredients", "Agricultural raw materials"],
      "Metals and raw materials": ["Steel", "Aluminium", "Copper", "Zinc", "Industrial minerals", "Other bulk raw materials"]
    },
    fields: [
      ["contract", "Contract", "select", ["Spot", "Forward"]], ["grade", "Grade / quality", "text"],
      ["origin", "Origin", "text"], ["terms", "Delivery terms", "select", INCOTERMS],
      ["port", "Port or delivery place", "text"], ["delivery_period", "Delivery / shipment period", "text"],
      ["payment_terms", "Payment terms", "text"], ["tolerance", "Quantity tolerance (%)", "number"],
      ["inspection", "Inspection / certification", "text"], ["samples", "Samples available", "yesno"]
    ],
    // Extra fields for edible oils (e.g. soybean degummed oil)
    oilFields: [
      ["ffa", "FFA (%)", "number"], ["moisture", "Moisture (%)", "number"], ["colour", "Colour", "text"],
      ["impurities", "Impurities (%)", "number"], ["refining", "Refining suitability", "text"], ["pricing_basis", "Pricing basis", "text"]
    ]
  },
  {
    id: "real-assets", name: "Real Assets", short: "Real assets",
    blurb: "Industrial and commercial property, land, leasing, joint ventures and buyer groups.",
    groups: {
      "Industrial real estate": ["Industrial land", "Factory plots", "Manufacturing units", "Industrial sheds", "Warehouses", "Industrial parks"],
      "Commercial real estate": ["Commercial buildings", "Offices", "Retail properties", "Commercial land", "Business centres"],
      "Residential and buyer groups": ["Group buying at cost", "Residential projects", "Residential plots", "Apartments", "Housing developments"],
      "Partnerships": ["Joint ventures", "Joint development", "Landowner-developer partnerships", "Project investments", "Revenue-sharing arrangements"],
      "Property leasing": ["Industrial leasing", "Commercial leasing", "Warehouse leasing", "Land leasing", "Long-term rental"]
    },
    fields: [
      ["area", "Area", "number"], ["area_unit", "Area unit", "select", ["sq ft", "sq m", "acres", "hectares", "sq yards"]],
      ["title_status", "Title and documents", "select", ["Clear title", "Title under process", "Leasehold", "Not sure"]],
      ["approvals", "Approvals (NA, zoning, building plan)", "text"], ["utilities", "Power, water and other utilities", "text"],
      ["road_access", "Road access and connectivity", "text"], ["site_visit", "Site visit possible", "yesno"]
    ]
  },
  {
    id: "storage", name: "Storage & Logistics", short: "Storage",
    blurb: "Warehouses, cold rooms, tanks, port space and transport capacity.",
    groups: {
      "Warehousing": ["General warehouses", "Industrial warehouses", "Agricultural warehouses", "Cold storage", "Bonded warehouses"],
      "Tank storage": ["Edible oil tanks", "Liquid storage", "Chemical storage (where permitted)", "Bulk liquid terminals", "Tank capacity leasing"],
      "Port infrastructure": ["Port storage", "Terminal services", "Bulk handling", "Loading and unloading", "Port-connected facilities"],
      "Transportation": ["Road transport", "Bulk tankers", "Container transport", "Rail logistics", "Multimodal transport"]
    },
    fields: [
      ["capacity", "Capacity available", "number"], ["capacity_unit", "Capacity unit", "select", ["sq ft", "MT", "KL", "pallets", "trucks / month"]],
      ["compatible", "Goods it suits", "text"], ["temperature", "Temperature", "select", ["Ambient", "Chilled", "Frozen", "Heated"]],
      ["duration", "Minimum / maximum period", "text"], ["handling", "Handling facilities", "text"],
      ["certifications", "Certifications / licences", "text"], ["rate_period", "Rate is per", "select", ["Day", "Month", "MT", "KL", "Trip"]]
    ]
  },
  {
    id: "barter-tech", name: "Barter-Tech", short: "Tech & education",
    blurb: "Technology, know-how, licences, technical services, and donations for education.",
    groups: {
      "Technology exchange": ["Industrial technology", "Manufacturing technology", "Process technology", "Automation solutions"],
      "Intellectual property": ["Technology licensing", "Patents", "Technical know-how", "Production formulas (where transferable)"],
      "Industrial innovation": ["Engineering solutions", "Product development", "Research partnerships", "Technical collaboration"],
      "Machinery and technology barter": ["Machinery against technology", "Equipment against licensing rights", "Technology against manufacturing capacity"],
      "Technical services": ["Engineering consultancy", "Installation", "Commissioning", "Maintenance", "Industrial automation"],
      "Education and donations": ["Computers and equipment for schools", "Software and licences for education", "Books and training material", "Skill training and internships"]
    },
    fields: [
      ["rights", "What you offer", "select", ["Sale", "Licence", "Donation", "Service", "Collaboration"]],
      ["ownership_rights", "Ownership and licensing rights", "text"], ["licence_term", "Licence duration", "text"],
      ["territory", "Geographic rights", "text"], ["nda", "NDA needed before details", "yesno"]
    ]
  },
  {
    id: "projects", name: "Projects & Finance", short: "Projects",
    blurb: "Industrial projects, partners and finance introductions through licensed partners.",
    groups: {
      "Industrial projects": ["New manufacturing projects", "Capacity expansion", "Industrial infrastructure", "Processing plants", "Renewable energy projects", "Industrial redevelopment"],
      "Investment partnerships": ["Strategic partnerships", "Joint ventures", "Project participation", "Asset-backed opportunities", "Revenue-sharing partnerships"],
      "Project requirements": ["Technology partner required", "Land required", "Machinery required", "Strategic investor required", "Operating partner required"],
      "Structured finance (via licensed partners)": ["Equipment financing", "Leasing partnerships", "Working capital introductions", "Project finance", "Asset-backed financing"]
    },
    fields: [
      ["capital", "Capital required", "number"], ["business_model", "Business model", "textarea"],
      ["promoter", "Promoter background", "textarea"], ["due_diligence", "Due diligence status", "select", ["Not started", "In progress", "Completed by a third party"]],
      ["risks", "Main risks (required)", "textarea"]
    ]
  }
];

export const DEAL_TYPES = ["Sale", "Purchase", "Lease", "Barter", "Partnership", "Service", "Donation"];
export const ROLES = ["Buyer", "Seller", "Manufacturer", "Trader", "Industrial owner", "Property owner", "Service provider", "Investor", "Broker / consultant", "International buyer", "International seller"];
export const CURRENCIES = ["INR", "USD", "EUR", "AED", "GBP"];
export const DOC_KINDS = [["business_registration", "Business registration"], ["gst", "GST certificate"], ["pan", "PAN"], ["ownership", "Ownership evidence"], ["invoice", "Machinery invoice"], ["title", "Property title"], ["quality_certificate", "Quality certificate"], ["authorisation", "Authorisation letter"], ["valuation_report", "Valuation report"], ["other", "Other"]];
export const LEVELS = ["", "Registered", "Contact confirmed", "Business KYC checked", "Business and asset documents reviewed", "Enhanced transaction checks"];
export const LEVEL_NOTE = "Verification shows which documents DASKIES has looked at. It does not guarantee a business's finances, or that an asset exists or is in the condition described.";

export const vertical = (id) => VERTICALS.find((v) => v.id === id);
export const subcats = (id) => { const v = vertical(id); return v ? Object.entries(v.groups) : []; };
export const isOil = (sub) => /oil/i.test(sub || "") && !/mill|DOC|cake|tank/i.test(sub || "");
export const DEAL_STAGES = [["enquiry", "Enquiry"], ["discussion", "Discussion"], ["offer", "Offer"], ["counteroffer", "Counteroffer"], ["terms_agreed", "Terms agreed"], ["due_diligence", "Due diligence"], ["documentation", "Documentation"], ["contract_signed", "Contract signed"], ["settlement", "Payment / settlement"], ["delivery", "Delivery"], ["completed", "Completed"]];
export const DEAL_KINDS = { sale: "Buy / sell", lease: "Lease", barter: "Barter (swap)", multi_barter: "Multi-party barter", commodity: "Commodity contract", service: "Service contract", partnership: "Project partnership", purchase: "Purchase" };
export const stageName = (s) => s === "cancelled" ? "Cancelled" : ((DEAL_STAGES.find(([k]) => k === s) || [, s])[1]);
export const defaultDealKind = (l) => l.vertical === "commodity" ? "commodity" : l.vertical === "projects" ? "partnership" : l.vertical === "barter-tech" ? "barter" : (l.deal_types || []).includes("Lease") && !(l.deal_types || []).includes("Sale") ? "lease" : "sale";
