/* Bhoomi Lens - reference data layer.
 * All values are MODELLED / INDICATIVE inputs used to drive the estimation engine.
 * They are not transaction records. Replace or override with real data via data/overrides.js.
 */
(function (root) {
  const BL = (root.BL = root.BL || {});

  /* ---------- Urban price anchors ----------
   * p   : indicative land price at the urban edge (INR per sq ft)
   * r   : decay radius in km (how far the city's pull extends)
   * tier: 1 = metro, 2 = large city, 3 = regional centre
   */
  BL.ANCHORS = [
    { n: "Mumbai", lat: 19.076, lon: 72.877, p: 32000, r: 34, tier: 1 },
    { n: "Delhi", lat: 28.613, lon: 77.209, p: 26000, r: 38, tier: 1 },
    { n: "Gurugram", lat: 28.459, lon: 77.026, p: 17000, r: 24, tier: 1 },
    { n: "Noida", lat: 28.535, lon: 77.391, p: 11500, r: 24, tier: 1 },
    { n: "Bengaluru", lat: 12.972, lon: 77.594, p: 15500, r: 34, tier: 1 },
    { n: "Hyderabad", lat: 17.385, lon: 78.487, p: 11500, r: 34, tier: 1 },
    { n: "Chennai", lat: 13.083, lon: 80.270, p: 12500, r: 30, tier: 1 },
    { n: "Pune", lat: 18.520, lon: 73.856, p: 9500, r: 30, tier: 1 },
    { n: "Kolkata", lat: 22.573, lon: 88.364, p: 8500, r: 28, tier: 1 },
    { n: "Ahmedabad", lat: 23.023, lon: 72.571, p: 7500, r: 28, tier: 1 },
    { n: "Surat", lat: 21.170, lon: 72.831, p: 5200, r: 20, tier: 2 },
    { n: "Jaipur", lat: 26.912, lon: 75.787, p: 4800, r: 24, tier: 2 },
    { n: "Lucknow", lat: 26.847, lon: 80.946, p: 4200, r: 24, tier: 2 },
    { n: "Chandigarh", lat: 30.733, lon: 76.779, p: 8000, r: 20, tier: 2 },
    { n: "Kochi", lat: 9.931, lon: 76.267, p: 6200, r: 20, tier: 2 },
    { n: "Coimbatore", lat: 11.017, lon: 76.956, p: 3800, r: 20, tier: 2 },
    { n: "Indore", lat: 22.720, lon: 75.858, p: 4200, r: 20, tier: 2 },
    { n: "Bhopal", lat: 23.260, lon: 77.413, p: 3000, r: 18, tier: 2 },
    { n: "Nagpur", lat: 21.146, lon: 79.088, p: 3200, r: 20, tier: 2 },
    { n: "Visakhapatnam", lat: 17.687, lon: 83.218, p: 4200, r: 20, tier: 2 },
    { n: "Bhubaneswar", lat: 20.296, lon: 85.825, p: 3600, r: 18, tier: 2 },
    { n: "Panaji", lat: 15.491, lon: 73.828, p: 6500, r: 22, tier: 2 },
    { n: "Thiruvananthapuram", lat: 8.524, lon: 76.936, p: 4600, r: 18, tier: 2 },
    { n: "Guwahati", lat: 26.144, lon: 91.736, p: 3200, r: 18, tier: 2 },
    { n: "Patna", lat: 25.594, lon: 85.137, p: 3600, r: 18, tier: 2 },
    { n: "Vadodara", lat: 22.307, lon: 73.181, p: 3600, r: 18, tier: 2 },
    { n: "Mysuru", lat: 12.296, lon: 76.639, p: 3200, r: 16, tier: 3 },
    { n: "Dehradun", lat: 30.316, lon: 78.032, p: 4200, r: 16, tier: 3 },
    { n: "Ludhiana", lat: 30.901, lon: 75.857, p: 4000, r: 18, tier: 3 },
    { n: "Kanpur", lat: 26.449, lon: 80.331, p: 2600, r: 18, tier: 3 },
    { n: "Varanasi", lat: 25.317, lon: 82.973, p: 3200, r: 16, tier: 3 },
    { n: "Raipur", lat: 21.251, lon: 81.629, p: 2300, r: 16, tier: 3 },
    { n: "Ranchi", lat: 23.344, lon: 85.310, p: 2600, r: 16, tier: 3 },
    { n: "Madurai", lat: 9.925, lon: 78.120, p: 2600, r: 16, tier: 3 },
    { n: "Nashik", lat: 19.997, lon: 73.790, p: 2700, r: 16, tier: 3 },
    { n: "Vijayawada", lat: 16.506, lon: 80.648, p: 4200, r: 18, tier: 3 },
    { n: "Srinagar", lat: 34.084, lon: 74.797, p: 4200, r: 14, tier: 3 },
    { n: "Amritsar", lat: 31.634, lon: 74.872, p: 3200, r: 16, tier: 3 },
    { n: "Jammu", lat: 32.727, lon: 74.857, p: 2600, r: 14, tier: 3 },
    { n: "Rajkot", lat: 22.303, lon: 70.802, p: 3000, r: 16, tier: 3 },
    { n: "Tiruchirappalli", lat: 10.790, lon: 78.705, p: 2200, r: 14, tier: 3 },
    { n: "Mangaluru", lat: 12.914, lon: 74.856, p: 3600, r: 14, tier: 3 },
    { n: "Aurangabad", lat: 19.876, lon: 75.343, p: 2300, r: 14, tier: 3 },
    { n: "Jodhpur", lat: 26.238, lon: 73.024, p: 2200, r: 14, tier: 3 },
    { n: "Agra", lat: 27.177, lon: 78.008, p: 2500, r: 14, tier: 3 },
    { n: "Meerut", lat: 28.984, lon: 77.706, p: 2800, r: 14, tier: 3 },
    { n: "Shimla", lat: 31.105, lon: 77.173, p: 4500, r: 10, tier: 3 },
    { n: "Siliguri", lat: 26.727, lon: 88.395, p: 2600, r: 14, tier: 3 }
  ];

  /* ---------- State parameters ----------
   * agri : typical agricultural land INR lakh per acre (rural baseline)
   * g    : fundamental nominal drift per year
   * cg   : circle-rate to market-price ratio (lower = bigger gap)
   * title: title / records risk 0-1 (higher = riskier)
   * water: groundwater stress 0-1
   * flood: base flood exposure 0-1
   * reg  : restriction on who can buy agricultural land 0-1
   * dig  : land-records digitisation maturity 0-1
   */
  const S = (agri, g, cg, title, water, flood, reg, dig) => ({ agri, g, cg, title, water, flood, reg, dig });
  BL.STATES = {
    "Andhra Pradesh": S(28, 0.072, 0.55, 0.45, 0.45, 0.45, 0.2, 0.75),
    "Arunachal Pradesh": S(6, 0.05, 0.6, 0.7, 0.1, 0.5, 0.95, 0.3),
    "Assam": S(10, 0.06, 0.55, 0.6, 0.15, 0.85, 0.4, 0.45),
    "Bihar": S(22, 0.065, 0.5, 0.7, 0.35, 0.85, 0.2, 0.45),
    "Chandigarh": S(250, 0.06, 0.7, 0.2, 0.5, 0.1, 0.3, 0.9),
    "Chhattisgarh": S(10, 0.06, 0.6, 0.55, 0.3, 0.3, 0.45, 0.6),
    "Delhi": S(300, 0.06, 0.45, 0.4, 0.85, 0.35, 0.3, 0.8),
    "Goa": S(80, 0.075, 0.5, 0.45, 0.25, 0.35, 0.3, 0.7),
    "Gujarat": S(30, 0.075, 0.55, 0.35, 0.6, 0.35, 0.85, 0.85),
    "Haryana": S(70, 0.07, 0.55, 0.35, 0.8, 0.3, 0.2, 0.8),
    "Himachal Pradesh": S(30, 0.06, 0.6, 0.4, 0.2, 0.3, 0.95, 0.7),
    "Jammu And Kashmir": S(25, 0.06, 0.6, 0.55, 0.2, 0.4, 0.6, 0.55),
    "Jharkhand": S(12, 0.055, 0.55, 0.7, 0.4, 0.3, 0.7, 0.45),
    "Karnataka": S(30, 0.075, 0.5, 0.35, 0.6, 0.3, 0.35, 0.85),
    "Kerala": S(55, 0.055, 0.55, 0.3, 0.25, 0.6, 0.3, 0.8),
    "Ladakh": S(8, 0.05, 0.6, 0.6, 0.5, 0.2, 0.9, 0.35),
    "Lakshadweep": S(20, 0.04, 0.6, 0.6, 0.3, 0.7, 0.95, 0.4),
    "Madhya Pradesh": S(15, 0.065, 0.6, 0.45, 0.45, 0.3, 0.2, 0.8),
    "Maharashtra": S(30, 0.07, 0.55, 0.35, 0.55, 0.4, 0.75, 0.9),
    "Manipur": S(8, 0.045, 0.6, 0.75, 0.1, 0.5, 0.8, 0.3),
    "Meghalaya": S(8, 0.05, 0.6, 0.75, 0.1, 0.4, 0.9, 0.3),
    "Mizoram": S(6, 0.045, 0.6, 0.7, 0.1, 0.4, 0.9, 0.3),
    "Nagaland": S(6, 0.045, 0.6, 0.8, 0.1, 0.4, 0.95, 0.25),
    "Odisha": S(14, 0.065, 0.55, 0.5, 0.25, 0.65, 0.3, 0.7),
    "Puducherry": S(90, 0.06, 0.5, 0.4, 0.5, 0.5, 0.3, 0.7),
    "Punjab": S(55, 0.05, 0.6, 0.35, 0.95, 0.4, 0.2, 0.75),
    "Rajasthan": S(14, 0.065, 0.6, 0.45, 0.85, 0.15, 0.3, 0.8),
    "Sikkim": S(15, 0.05, 0.6, 0.6, 0.1, 0.4, 0.95, 0.4),
    "Tamil Nadu": S(35, 0.07, 0.5, 0.35, 0.65, 0.5, 0.2, 0.85),
    "Telangana": S(35, 0.08, 0.5, 0.4, 0.55, 0.3, 0.2, 0.85),
    "Tripura": S(10, 0.05, 0.6, 0.6, 0.15, 0.5, 0.6, 0.45),
    "Uttar Pradesh": S(30, 0.07, 0.55, 0.6, 0.6, 0.6, 0.2, 0.65),
    "Uttarakhand": S(30, 0.06, 0.6, 0.45, 0.3, 0.45, 0.75, 0.65),
    "West Bengal": S(22, 0.055, 0.55, 0.6, 0.4, 0.75, 0.4, 0.6),
    "Andaman And Nicobar Islands": S(15, 0.04, 0.6, 0.6, 0.2, 0.7, 0.9, 0.45),
    "Dadra Nagar Haveli Daman Diu": S(45, 0.065, 0.55, 0.45, 0.4, 0.4, 0.6, 0.65)
  };
  BL.DEFAULT_STATE = S(15, 0.06, 0.55, 0.5, 0.4, 0.4, 0.4, 0.6);

  /* ---------- Catalyst type parameters ----------
   * U : maximum uplift on land value at zero distance when fully realised
   * r : decay distance in km
   * lag: years after completion until the effect is fully priced in
   */
  /* Uplift parameters re-calibrated (Oct 2026) against observed land-price changes around
   * Hyderabad ORR, Bengaluru KIA, Delhi-Meerut RRTS, Yamuna Expwy/Jewar, Navi Mumbai airport + Atal Setu,
   * Dwarka Expressway and Samruddhi. See data/backtest.js and the "How the model works" panel. */
  BL.TYPES = {
    airport:    { label: "Airport", U: 1.3, r: 30, lag: 4, color: "#ffb547", icon: "A" },
    expressway: { label: "Expressway", U: 0.7, r: 8, lag: 3, color: "#5ad1ff", icon: "E" },
    metro:      { label: "Metro / RRTS", U: 0.2, r: 3.5, lag: 2, color: "#b98cff", icon: "M" },
    hsr:        { label: "High-speed rail", U: 0.2, r: 6, lag: 4, color: "#ff7ab6", icon: "H" },
    industrial: { label: "Industrial node", U: 0.55, r: 16, lag: 5, color: "#7cf29a", icon: "I" },
    port:       { label: "Port", U: 0.38, r: 20, lag: 5, color: "#4fe3d0", icon: "P" },
    city:       { label: "New city / capital", U: 0.65, r: 20, lag: 6, color: "#ff9f6e", icon: "C" },
    ring:       { label: "Ring road", U: 1.0, r: 7, lag: 3, color: "#7fb2ff", icon: "R" },
    freight:    { label: "Freight corridor", U: 0.18, r: 10, lag: 4, color: "#c7d36f", icon: "F" },
    finance:    { label: "Finance / IT hub", U: 0.6, r: 12, lag: 4, color: "#f3e27a", icon: "$" }
  };
  /* Share of a project's effect priced in on announcement and by completion (was 30% / 65%). */
  BL.CURVE = { ann: 0.35, done: 0.85 };
  /* Land leverage multiplier = a + b * (1 - price-urbanness), where price-urbanness = log10(price/50)/log10(400).
   * Rural land (~Rs 50/sq ft) gets ~2x the percentage uplift; built-up land (Rs 20k+/sq ft) ~0.45x. */
  BL.LEVERAGE = { a: 0.45, b: 1.6 };
  BL.DATA_ASOF = "Oct 2026";

  BL.STAGES = ["Announced", "Approved / DPR", "Land acquisition", "Under construction", "Operational"];
  BL.STAGE_P = [0.35, 0.5, 0.65, 0.86, 1.0];

  /* ---------- Catalysts ----------
   * Status snapshot is indicative; always verify current status before investing.
   * pt: [lon, lat] for point catalysts; path: [[lon,lat],...] for linear ones.
   * cred: delivery credibility of the implementing agency 0-1.
   */
  BL.CATALYSTS = [
    // Airports
    { id: "nmia", n: "Navi Mumbai International Airport", t: "airport", pt: [73.07, 18.99], stage: 4, ann: 2008, eta: 2025, cred: 0.75, ag: "CIDCO / Adani", note: "Second airport for the Mumbai region. Drives Ulwe, Panvel, Uran and Pen." },
    { id: "jewar", n: "Noida International Airport (Jewar)", t: "airport", pt: [77.61, 28.17], stage: 3, ann: 2017, eta: 2026, cred: 0.75, ag: "YIAPL / UP Govt", note: "Anchors the Yamuna Expressway belt, film city and YEIDA sectors." },
    { id: "parandur", n: "Parandur Greenfield Airport", t: "airport", pt: [79.79, 12.93], stage: 2, ann: 2022, eta: 2030, cred: 0.6, ag: "TIDCO", note: "Chennai's second airport. Local land-acquisition opposition adds delay risk." },
    { id: "purandar", n: "Purandar Airport (Pune)", t: "airport", pt: [74.05, 18.33], stage: 1, ann: 2016, eta: 2030, cred: 0.5, ag: "MADC", note: "Site has shifted before, so treat timelines with caution." },
    { id: "bhogapuram", n: "Bhogapuram Airport (Vizag)", t: "airport", pt: [83.47, 18.05], stage: 3, ann: 2015, eta: 2026, cred: 0.7, ag: "GMR / AP Govt", note: "Pulls Vizag growth north towards Vizianagaram." },
    { id: "dholera_ap", n: "Dholera Airport", t: "airport", pt: [72.13, 22.32], stage: 3, ann: 2019, eta: 2026, cred: 0.7, ag: "DIACL", note: "Supports the Dholera Special Investment Region." },
    { id: "mopa", n: "Mopa (Manohar) International Airport", t: "airport", pt: [73.86, 15.73], stage: 4, ann: 2000, eta: 2022, cred: 0.75, ag: "GMR", note: "Shifted Goa's growth axis north towards Pernem." },
    { id: "hirasar", n: "Rajkot Hirasar Airport", t: "airport", pt: [71.03, 22.38], stage: 4, ann: 2017, eta: 2023, cred: 0.8, ag: "AAI", note: "Greenfield airport for the Saurashtra industrial belt." },
    { id: "hosur_ap", n: "Hosur Airport (proposed)", t: "airport", pt: [77.83, 12.74], stage: 0, ann: 2024, eta: 2032, cred: 0.45, ag: "TN Govt", note: "Early-stage proposal. High optionality, low certainty." },

    // Expressways and ring roads
    { id: "dme", n: "Delhi-Mumbai Expressway", t: "expressway", path: [[77.07, 28.25], [76.33, 26.88], [75.83, 25.18], [75.04, 23.33], [73.18, 22.31], [72.81, 19.45]], stage: 3, ann: 2018, eta: 2027, cred: 0.8, ag: "NHAI", note: "India's longest access-controlled expressway. Interchange nodes matter most." },
    { id: "samruddhi", n: "Samruddhi Mahamarg (Nagpur-Mumbai)", t: "expressway", path: [[79.09, 21.15], [77.75, 20.71], [75.34, 19.88], [74.48, 19.77], [73.56, 19.69], [73.10, 19.22]], stage: 4, ann: 2015, eta: 2025, cred: 0.8, ag: "MSRDC", note: "Planned growth nodes along the corridor are the opportunity." },
    { id: "blr_che", n: "Bengaluru-Chennai Expressway", t: "expressway", path: [[77.80, 13.07], [78.13, 13.13], [78.80, 13.03], [79.10, 13.22], [79.95, 12.97]], stage: 3, ann: 2011, eta: 2026, cred: 0.75, ag: "NHAI", note: "Cuts travel to about 2.5 hours. Kolar, Chittoor and Sriperumbudur benefit." },
    { id: "ganga", n: "Ganga Expressway", t: "expressway", path: [[77.71, 28.98], [78.47, 28.60], [79.12, 28.03], [79.83, 27.30], [80.49, 26.55], [81.85, 25.43]], stage: 3, ann: 2019, eta: 2026, cred: 0.72, ag: "UPEIDA", note: "Meerut to Prayagraj. Opens up the agrarian belt of central UP." },
    { id: "mthl", n: "Atal Setu (Mumbai Trans Harbour Link)", t: "expressway", path: [[72.86, 19.0], [72.95, 18.98], [73.0, 18.95]], stage: 4, ann: 2004, eta: 2024, cred: 0.75, ag: "MMRDA", note: "Connects South Mumbai to Navi Mumbai and the Raigad belt." },
    { id: "dwarka", n: "Dwarka Expressway", t: "expressway", path: [[77.05, 28.59], [77.03, 28.50], [77.0, 28.42]], stage: 4, ann: 2006, eta: 2024, cred: 0.7, ag: "NHAI", note: "Re-rated New Gurugram sectors after opening." },
    { id: "amritsar_jam", n: "Amritsar-Jamnagar Economic Corridor", t: "expressway", path: [[74.87, 31.63], [74.3, 30.2], [73.3, 28.0], [72.4, 26.0], [71.5, 24.0], [70.07, 22.47]], stage: 3, ann: 2017, eta: 2027, cred: 0.7, ag: "NHAI", note: "Logistics corridor through western Rajasthan to the Gujarat ports." },
    { id: "hyd_rrr", n: "Hyderabad Regional Ring Road", t: "ring", ring: { lon: 78.487, lat: 17.385, rdeg: 0.6 }, stage: 1, ann: 2016, eta: 2030, cred: 0.6, ag: "NHAI / Telangana", note: "The outer ring around the ORR. Land 50-70 km out is the early-stage play." },
    { id: "blr_strr", n: "Bengaluru Satellite Town Ring Road", t: "ring", ring: { lon: 77.594, lat: 12.972, rdeg: 0.5 }, stage: 3, ann: 2016, eta: 2027, cred: 0.65, ag: "NHAI", note: "Links Hoskote, Dobbaspet, Ramanagara and Anekal." },
    { id: "che_prr", n: "Chennai Peripheral Ring Road", t: "expressway", path: [[80.32, 13.23], [79.91, 13.14], [79.95, 12.97], [80.0, 12.76], [80.19, 12.62]], stage: 3, ann: 2018, eta: 2028, cred: 0.6, ag: "TNRDC", note: "Ennore to Mahabalipuram. Western Chennai belt re-rating." },

    // Metro and RRTS
    { id: "blr_air_metro", n: "Bengaluru Airport Metro (Blue Line)", t: "metro", path: [[77.623, 12.917], [77.69, 13.0], [77.64, 13.035], [77.63, 13.10], [77.707, 13.199]], stage: 3, ann: 2019, eta: 2027, cred: 0.6, ag: "BMRCL", note: "Pulls North Bengaluru (Hebbal to Devanahalli) closer to the city." },
    { id: "pune_l3", n: "Pune Metro Line 3 (Hinjewadi)", t: "metro", path: [[73.74, 18.59], [73.79, 18.56], [73.85, 18.53]], stage: 3, ann: 2018, eta: 2026, cred: 0.65, ag: "PMRDA", note: "Links the Hinjewadi IT park to Shivajinagar." },
    { id: "che_m2", n: "Chennai Metro Phase 2 (Corridor 3)", t: "metro", path: [[80.23, 13.15], [80.22, 13.05], [80.22, 12.98], [80.23, 12.84]], stage: 3, ann: 2017, eta: 2027, cred: 0.7, ag: "CMRL", note: "Madhavaram to SIPCOT along the OMR spine." },
    { id: "hyd_air_metro", n: "Hyderabad Airport Metro", t: "metro", path: [[78.38, 17.44], [78.40, 17.35], [78.43, 17.24]], stage: 1, ann: 2022, eta: 2030, cred: 0.55, ag: "HAML", note: "Raidurg to Shamshabad. Alignment is being revised." },
    { id: "rrts", n: "Delhi-Meerut RRTS (Namo Bharat)", t: "metro", path: [[77.25, 28.59], [77.43, 28.67], [77.55, 28.80], [77.71, 28.98]], stage: 4, ann: 2017, eta: 2025, cred: 0.8, ag: "NCRTC", note: "Makes Modinagar and Meerut viable as commuter towns." },

    // High-speed rail
    { id: "mahsr", n: "Mumbai-Ahmedabad High-Speed Rail", t: "hsr", path: [[72.865, 19.065], [73.02, 19.19], [72.81, 19.45], [72.75, 19.80], [72.90, 20.37], [72.97, 20.77], [72.83, 21.17], [72.98, 21.70], [73.18, 22.31], [72.95, 22.56], [72.58, 23.03]], stage: 3, ann: 2015, eta: 2029, cred: 0.6, ag: "NHSRCL", note: "Station-area land is the play: Surat, Vapi, Bharuch and Anand." },

    // Industrial, cities, finance, ports
    { id: "dholera", n: "Dholera SIR + semiconductor fab", t: "industrial", pt: [72.19, 22.25], stage: 3, ann: 2009, eta: 2028, cred: 0.6, ag: "DICDL / Tata", note: "Long-dated greenfield city. Fab investment changed its credibility." },
    { id: "sanand", n: "Sanand semiconductor and auto cluster", t: "industrial", pt: [72.38, 22.99], stage: 3, ann: 2009, eta: 2026, cred: 0.8, ag: "GIDC", note: "Micron ATMP and auto OEMs." },
    { id: "auric", n: "AURIC Shendra-Bidkin", t: "industrial", pt: [75.45, 19.83], stage: 4, ann: 2014, eta: 2022, cred: 0.7, ag: "AITL", note: "Industrial smart city on the DMIC." },
    { id: "tumakuru", n: "Tumakuru Industrial Node", t: "industrial", pt: [77.10, 13.34], stage: 3, ann: 2016, eta: 2027, cred: 0.6, ag: "NICDC / KIADB", note: "Part of the Chennai-Bengaluru Industrial Corridor." },
    { id: "krishnapatnam", n: "Krishnapatnam Industrial Node", t: "industrial", pt: [80.12, 14.25], stage: 2, ann: 2016, eta: 2029, cred: 0.55, ag: "NICDC / APIIC", note: "CBIC node near Nellore." },
    { id: "gnida", n: "Greater Noida Integrated Township", t: "industrial", pt: [77.53, 28.47], stage: 4, ann: 2014, eta: 2021, cred: 0.75, ag: "DMIC IITGNL", note: "Plug-and-play industrial plots." },
    { id: "hosur_ev", n: "Hosur EV and electronics belt", t: "industrial", pt: [77.83, 12.74], stage: 3, ann: 2019, eta: 2027, cred: 0.7, ag: "SIPCOT", note: "Ola, Tata Electronics and Ather plants spill over from Bengaluru." },
    { id: "amaravati", n: "Amaravati Capital City", t: "city", pt: [80.52, 16.51], stage: 3, ann: 2015, eta: 2029, cred: 0.5, ag: "APCRDA", note: "Revived after a long pause. Very high payoff if delivered, with political risk." },
    { id: "gift", n: "GIFT City", t: "finance", pt: [72.68, 23.16], stage: 4, ann: 2007, eta: 2020, cred: 0.8, ag: "GIFT Co / Gujarat", note: "International financial services centre. Liquor and residential reforms are pushing demand." },
    { id: "naya_raipur", n: "Nava Raipur Atal Nagar", t: "city", pt: [81.78, 21.16], stage: 4, ann: 2000, eta: 2015, cred: 0.6, ag: "NRANVP", note: "Built but under-occupied. A cautionary analogue." },
    { id: "vadhavan", n: "Vadhavan Deep-Water Port", t: "port", pt: [72.67, 19.93], stage: 2, ann: 2020, eta: 2030, cred: 0.65, ag: "VPPL / JNPA", note: "Mega-port in Palghar. Logistics and warehousing land play." },
    { id: "vizhinjam", n: "Vizhinjam International Seaport", t: "port", pt: [76.99, 8.38], stage: 4, ann: 2015, eta: 2025, cred: 0.7, ag: "Adani / Kerala", note: "Transshipment hub south of Thiruvananthapuram." },
    { id: "nicobar", n: "Great Nicobar Project", t: "port", pt: [93.85, 6.85], stage: 1, ann: 2021, eta: 2035, cred: 0.35, ag: "ANIIDCO", note: "Ecologically contested, with restricted land markets." },
    { id: "tajpur", n: "Tajpur Deep-Sea Port", t: "port", pt: [87.6, 21.66], stage: 0, ann: 2022, eta: 2032, cred: 0.35, ag: "WB Govt", note: "Repeatedly re-tendered. Speculative." },

    // Freight
    { id: "wdfc", n: "Western Dedicated Freight Corridor", t: "freight", path: [[77.55, 28.55], [76.62, 28.2], [75.24, 26.87], [72.43, 24.17], [73.18, 22.31], [72.95, 18.95]], stage: 4, ann: 2006, eta: 2025, cred: 0.7, ag: "DFCCIL", note: "Logistics parks and warehousing at the junction stations." },
    { id: "edfc", n: "Eastern Dedicated Freight Corridor", t: "freight", path: [[75.85, 30.9], [77.3, 29.4], [78.0, 27.9], [80.33, 26.45], [81.85, 25.43], [84.1, 24.8]], stage: 4, ann: 2006, eta: 2023, cred: 0.7, ag: "DFCCIL", note: "Ludhiana to Sonnagar. Warehousing nodes in UP and Bihar." }
  ];

  /* ---------- Historical analogues (illustrative) ----------
   * f: feature vector [priceIdx 0-1, catalystMomentum 0-1, urbanProximity 0-1, fundamentalGrowth 0-1]
   * mult: approximate 10-year land value multiple observed afterwards (indicative, rounded)
   */
  BL.ANALOGUES = [
    { n: "Whitefield, Bengaluru", y: 2003, f: [0.34, 0.75, 0.62, 0.8], mult: 8, why: "IT parks plus a new road link pulled the city east." },
    { n: "Gachibowli, Hyderabad", y: 2005, f: [0.3, 0.8, 0.55, 0.85], mult: 9, why: "Government-backed IT and financial district, plus the ORR." },
    { n: "Golf Course Extn, Gurugram", y: 2004, f: [0.42, 0.7, 0.7, 0.75], mult: 6, why: "Licensed colonies and expressway access." },
    { n: "Hinjewadi, Pune", y: 2006, f: [0.28, 0.65, 0.5, 0.7], mult: 5, why: "IT park phases expanded, with later metro access." },
    { n: "OMR, Chennai", y: 2007, f: [0.33, 0.7, 0.55, 0.65], mult: 4, why: "IT corridor; flood exposure capped gains." },
    { n: "Noida Extension", y: 2010, f: [0.25, 0.55, 0.6, 0.55], mult: 2.5, why: "Oversupply and litigation diluted the upside." },
    { n: "New Town Rajarhat, Kolkata", y: 2008, f: [0.27, 0.5, 0.55, 0.45], mult: 2.2, why: "Planned township with slower absorption." },
    { n: "Ulwe, Navi Mumbai", y: 2015, f: [0.45, 0.85, 0.5, 0.7], mult: 3, why: "Airport plus Atal Setu re-rating." },
    { n: "Devanahalli, Bengaluru", y: 2008, f: [0.18, 0.75, 0.3, 0.65], mult: 6, why: "The airport opened, then the aerospace park arrived." },
    { n: "Sanand, Ahmedabad", y: 2009, f: [0.12, 0.6, 0.35, 0.6], mult: 4, why: "The Tata Nano plant triggered an auto cluster." },
    { n: "Nava Raipur", y: 2010, f: [0.08, 0.45, 0.3, 0.35], mult: 1.6, why: "Infrastructure was built ahead of demand and stayed under-occupied." },
    { n: "Yamuna Expressway belt", y: 2012, f: [0.15, 0.6, 0.35, 0.45], mult: 2, why: "Long stagnation until the airport was confirmed." },
    { n: "Shamshabad, Hyderabad", y: 2008, f: [0.12, 0.8, 0.35, 0.75], mult: 6, why: "Airport plus pharma and aerospace SEZs." },
    { n: "Rural hinterland (no catalyst)", y: 2010, f: [0.04, 0.05, 0.08, 0.4], mult: 1.9, why: "Grew only with general agricultural land inflation." }
  ];

  BL.MODEL_YEAR = 2026;
  BL.YEAR_MIN = 2015;
  BL.YEAR_MAX = 2036;
})(typeof window !== "undefined" ? window : globalThis);
