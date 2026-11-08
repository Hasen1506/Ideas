# Maharashtra evidence pilot

## Objective

Start with a small set of residential-plot locations in the Pune district and answer: what documented asking prices, reported transactions and official reference rates are available for a clearly described location and date? These are separate observations. An official ready-reckoner rate is not itself an observed sale price.

The app already contains 78 priced market-related reference rows tagged Maharashtra in the 8 November 2026 snapshot: 18 reported registrations, 18 listings, 13 reported deals, 17 government auctions, 2 government allotments and 10 listing aggregates. These are not 78 verified independent sales; the dates and underlying source records must be checked, and they cover more than Pune.

## Official sources and access check

- Maharashtra's [eASR 2.0 district gateway](https://igreval.maharashtra.gov.in/eASR2.0/) is on the government's domain and identifies the Department of Stamps and Registration. On 8 November 2026 it returned its district selection page from this environment, while linked Pune and Raigad result pages returned gateway errors. This does not establish that the portal is unavailable to everyone.
- The [Maharashtra land-records service directory](https://nanded.gov.in/en/national-land-records-modernization-program-nlrmp/) lists the ready reckoner and separate land-record and map services. A map or record lookup does not establish title without reviewing the relevant records.
- A [2012 Mumbai Metro social-impact report](https://mmrda.maharashtra.gov.in/sites/default/files/2021-09/ML3_SIA%20Report.pdf), Annexure 6.2, describes how ready-reckoner revisions at the time used selected registered transactions, developer quotations and other information. That historic description is not proof of the current methodology or an independent observation of any particular sale.
- `scripts/collect_rates.py mh` is an unfinished, interactive helper. It has not been verified against a successful current eASR result page, and its generic table parsing is not a validated collector. Do not schedule it as an unattended bulk job.

## Work required before scheduling collection

1. Capture one successfully retrieved official result for a specific Pune taluka, village/zone, property class and effective financial year. Preserve the public source URL, retrieval date and the original published unit. Check the value against the portal, including the financial year and land category.
2. Build a source-specific parser against real, permitted examples. Record district, taluka, village/zone, land class, rate, unit, effective period, retrieval date, source and location precision. Preserve permitted source evidence; exclude session tokens and unnecessary personal details.
3. Test unit conversions, changed page layout, empty/error responses, duplicate records and the difference between an actual result and an error page. Require at least one manually verified fixture before enabling an automated collector.
4. Use bounded requests and checkpoints. Write a new data snapshot only when verified content changes; keep failures and source freshness visible. Stop or back off on access failures instead of storing repeated error pages. Do not bypass login, CAPTCHA or site restrictions.
5. Add separate, lawfully usable asking-price and reported-transaction observations. Deduplicate syndicated listings, distinguish transaction and collection dates, and document reuse rights. Do not infer undisclosed payment amounts from a registration or a listing.

Only after a small sample passes these checks should collection be expanded or scheduled. Model evaluation needs repeated, comparable observations over time; a collection of official rates alone does not establish market-price growth or infrastructure effects.
