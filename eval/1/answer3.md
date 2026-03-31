This is the eternal marketplace tension — the "data quality trilemma." You want three things simultaneously: high listing quality, low seller friction, and bad actor suppression. The hard truth is you can't perfectly maximize all three, but you can architect a system that gets remarkably close. Here's how I'd frame it:

## The Core Insight: Separate the Ingestion Path from the Enforcement Path

Most marketplaces make the mistake of front-loading all quality gates at listing creation. This creates massive friction for good sellers while barely deterring bad actors (who just learn to game the gates). Instead, think of it as two distinct systems:

**1. Make the "happy path" effortless — then enrich behind the scenes**

Rather than demanding perfect data upfront, accept minimal viable listing data from sellers, then use automated enrichment to fill gaps. This is where your catalog infrastructure becomes the real lever:

- Accept seller input loosely (title, images, a price, basic category), then normalize it programmatically — entity extraction from titles, image-based attribute inference, matching against known product graphs.
- Auto-map seller listings to canonical products (your existing Product ID / Item ID architecture). If the match is high-confidence, it's zero-touch. If ambiguous, route to a lightweight seller confirmation step, not a blank form.
- Use the catalog's attribute taxonomy to *infer* what's missing rather than *demanding* it. A seller uploads a shoe listing with an image — you can extract color, likely size range, brand, and material without asking.

The philosophy: **the platform owns data quality, not the seller.** Sellers own the offer (price, inventory, shipping). The catalog team owns the product truth.

**2. Shift enforcement to post-listing, behavioral signals**

Bad actors don't reveal themselves at the listing form — they reveal themselves through patterns:

- **Velocity anomalies**: 500 listings in an hour, all with slightly permuted titles? That's not a legitimate seller.
- **Image fingerprinting**: Stolen product images, stock photos reused across unrelated categories, or images that don't match the declared product.
- **Price-to-category mismatches**: A "MacBook Pro" listed at $50 in Electronics isn't a data quality issue — it's a fraud signal.
- **Return/complaint clustering**: High defect rates on specific seller-SKU combinations are a lagging but reliable indicator.
- **Listing-to-catalog mismatch scoring**: If your enrichment pipeline can't confidently match a listing to any known product, that's a soft signal worth scoring.

The key is building a **trust score** at the seller level that modulates what enforcement they experience. New or low-trust sellers get more gates. Established sellers with clean histories get a fast lane. This is effectively a "progressive trust" model — friction is proportional to risk, not applied uniformly.

**3. The Bad Actor Playbook Specifically**

Bad actors fall into a few archetypes, each needing a different response:

- **Counterfeiters**: Brand-gating + image/title similarity detection against known authentic listings + proactive brand partnership programs (let brands flag and verify).
- **Listing hijackers** (attaching bad offers to good product pages): This is where your M:N grouping work directly helps — if you control the clustering logic, you can enforce tighter matching rules on *who* can attach to *which* product page.
- **Keyword stuffers / miscategorizers**: Post-listing NLP classifiers that flag title-category misalignment, with automated suppression.
- **Disposable account churners**: Device fingerprinting, payment method clustering, behavioral biometrics at registration — catch the pattern, not just the individual account.

**4. The Architectural Unlock You're Already Building**

Your Attribute-Based Clustering (M:N) transition is actually a massive enabler here. When the platform owns the canonical product definition and sellers attach offers to it, you fundamentally shift the data quality burden:

- The product page quality is *your* responsibility (golden record, enriched attributes, normalized taxonomy).
- The seller's responsibility shrinks to: "Is this the right product? What's my price/inventory/condition?"
- Mismatches between a seller's claimed product and the canonical record become detectable signals, not just noise.

This is why the Fashion Master Catalog POC matters beyond fashion — it's a proof point that the platform can own the product truth at scale.

**The Bottom Line**

The formula is: **easy ingestion → automated enrichment → behavioral enforcement → progressive trust.** You stop trying to make every seller a perfect data entry clerk, and instead build the infrastructure that makes their imperfect inputs converge toward quality — while using behavioral signals to surgically remove bad actors without punishing everyone else.

The sellers who are clean won't even notice the enforcement. The sellers who aren't will find the platform increasingly inhospitable. That's the goal.

Want to dig into any of these layers more specifically — particularly how it maps to the Coupang catalog architecture?