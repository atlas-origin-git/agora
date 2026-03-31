This is one of the hardest problems in catalog management — and it's the exact territory where most marketplaces accumulate massive duplicate debt. When you don't have GTIN or MPN as a deterministic key, you're forced into probabilistic matching, which means you need a layered strategy. Here's how to approach it at scale:

## 1. Build a Composite Identity Signal

Without a universal key, you construct one from multiple weak signals. The typical stack, in order of signal strength:

- **Brand + Model Name normalization** — strip whitespace, casing, Korean/English transliteration variants, common abbreviations (e.g., "삼성" ↔ "Samsung"). This alone won't deduplicate, but it's your first coarse filter.
- **Title tokenization + key attribute extraction** — parse out color, size, capacity, material, pack count. A title like "나이키 에어맥스 90 블랙 270mm" needs to decompose into structured attributes before you can match.
- **Image fingerprinting** — perceptual hashing (pHash, dHash) or embedding-based similarity (CLIP vectors) to catch listings that describe the same product differently but use the same hero image. This is surprisingly effective for fashion and hardlines.
- **Price band clustering** — same product from different sellers rarely differs by more than ~30%. Price acts as a weak negative signal (if prices diverge wildly, probably not the same SKU).

## 2. The Matching Pipeline Architecture

At scale you can't do all-pairs comparison. The standard pattern is **blocking → candidate generation → pairwise scoring → clustering**:

- **Blocking**: Partition the catalog into coarse buckets (same L3 category + brand). This reduces your comparison space from O(n²) to something manageable.
- **Candidate generation**: Within each block, use TF-IDF or embedding similarity on normalized titles to generate candidate pairs above a threshold (e.g., cosine > 0.75).
- **Pairwise scoring**: Run a trained classifier (gradient-boosted trees work well here) on feature vectors: title similarity, image similarity, attribute overlap, price ratio, seller overlap. Output a match probability.
- **Transitive clustering**: Use connected components or hierarchical agglomerative clustering with a cut threshold. Be careful — transitive closure can create "mega-clusters" that merge unrelated products through a chain of weak links. You need a cluster coherence check.

## 3. The Brand-Specific Problem

Brands that don't use GTIN/MPN tend to fall into a few archetypes, each needing a different treatment:

- **Korean DTC / indie brands** (fashion, cosmetics) — often no standardized naming at all. Here, image matching + seller-provided brand name is your strongest signal. An agentic scraping approach (like your Fashion Master Catalog concept) to build a golden record from the brand's own site is the right move — it gives you the canonical product list to match against.
- **Unbranded / white-label goods** (hardlines, home & garden) — these are nearly impossible to deduplicate reliably because they genuinely *are* different products with identical specs from different factories. Here the question becomes whether you even *should* merge them, or treat them as distinct products competing on price and reviews.
- **Regional/niche brands with inconsistent naming** — the most tractable case. Build a brand-level normalization dictionary and enforce structured attribute submission at ingestion time.

## 4. The Operational Reality

The technical pipeline is only half the battle. The other half is:

- **Precision vs. recall tradeoff** — false merges (grouping different products together) are far more damaging than missed merges (leaving duplicates). A customer seeing the wrong product on a page destroys trust. Set your threshold to favor precision, and use human review queues for the uncertain middle band.
- **Seller-assisted deduplication** — expose a "is this the same product?" flow to sellers during listing creation. Show them candidate matches and let them confirm or deny. This is free labeled training data.
- **Continuous feedback loop** — customer returns with reason "not as described" and seller disputes on grouped listings are strong signals that a merge was wrong. Feed these back into the model.

## 5. Where This Connects to Your M:N Architecture

This is actually where the Attribute-Based Clustering approach pays off most. In a rigid 1:N model, a wrong merge is catastrophic — you've permanently linked an Item ID to the wrong Product ID. In an M:N model with attribute-based grouping in the experience layer, you can:

- Group aggressively for *discovery* (show the customer all plausible matches)
- But let the attribute vector determine which items actually appear as "offers" on the same product page
- Unwind bad groupings without a data migration — just update the clustering logic

This decoupling of identity from presentation is what makes probabilistic matching viable at scale. Without it, you'd need near-perfect precision before you could group anything, which means most of your long-tail catalog stays ungrouped and undiscoverable.

---

The short version: without deterministic keys, you're building a **multi-signal entity resolution system** with a blocking-and-scoring pipeline, and the key architectural insight is to make grouping decisions reversible and presentation-layer-only so you can iterate aggressively without breaking the catalog.

Want me to go deeper on any specific layer — the ML scoring model, the image matching approach, or the operational workflow for human review?