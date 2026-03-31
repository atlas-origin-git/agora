# **How to Merge SKUs Without GTIN or MPN at Scale**

## **The Short Answer**

Build a multi-stage matching system using fuzzy algorithms on normalized product attributes, combined with synthetic identifiers for ongoing management. Start with exact brand/category blocking to make the problem computationally manageable, then apply similarity scoring within blocks, and implement human review workflows for borderline cases.

## **What the Experts Uncovered**

Data quality is your biggest enemy. Manufacturers create the same product data differently across channels \- Samsung TVs appear as "Samsung 65" QLED 4K Smart TV" in one feed and "SAMSUNG QN65Q70CAFXZA 65-Inch" in another. Electronics suffer from inconsistent technical specs ("Wi-Fi 5" vs "802.11ac"), apparel struggles with color naming ("Navy Blue" vs "Midnight Navy"), and every category has localization issues (metric vs imperial units).

The computational challenge scales exponentially. One million SKUs means 500 billion potential comparisons. Without smart blocking strategies, your servers will crash before completing the first matching run. The key insight is that you can't do naive pairwise comparison \- you need hierarchical approaches that eliminate obviously non-matching products before running expensive similarity algorithms.

Post-merge governance is more complex than the initial merge. Once products are consolidated, you need to track which manufacturer feed contributed which attributes, handle conflicting updates (Feed A says the price is $99, Feed B says $89), and maintain audit trails for when disputes arise. Most organizations underestimate this ongoing operational complexity.

Match quality depends heavily on your error tolerance. False positives (merging different products) vs false negatives (missing legitimate matches) have different business costs. Electronics retailers fear false positives because wrong technical specs lose customer trust, while fashion retailers fear false negatives because missed matches fragment their inventory visibility.

## **What You Should Do**

1. Implement three-tier blocking before any similarity matching: Start with exact brand and category matches to create smaller comparison pools. Then add fuzzy brand matching for slight variations. Only run full similarity algorithms within these blocks \- this reduces computational complexity from unmanageable to practical.  
2. Use ensemble scoring with category-specific thresholds: Combine Jaccard similarity (40% weight), TF-IDF for descriptions (30%), exact attribute matches (20%), and learned embeddings (10%). Set conservative thresholds (0.85+) for electronics where wrong matches are expensive, more lenient thresholds (0.65-0.75) for fashion where missed matches hurt more.  
3. Create synthetic identifiers using hierarchical hashing: Build composite keys like `{Brand_Hash}:{Product_Family}:{Core_Specs_Hash}:{Variant_Hash}` where each component has different stability guarantees. This lets you handle product reformulations and packaging changes without breaking your entire catalog structure.  
4. Set up human review workflows for matches scoring 0.65-0.85: These borderline cases contain both your most valuable matches and your most dangerous errors. Create review queues by category and train reviewers on common matching patterns. Use their feedback to continuously tune your algorithm weights.  
5. Implement delta processing for ongoing operations: Only recalculate similarities for products that have changed or are newly added. In mature catalogs, this reduces computational load by 90%+ while maintaining match quality.

## **Watch Out For**

Don't underestimate post-merge data governance complexity. You'll need granular lineage tracking at the attribute level (not just "this product came from Feed A" but "price from Feed A, description from Feed B, specs from Feed C with timestamps for each"). Plan for conflicting updates and authority resolution before you start merging.

Avoid the "perfect algorithm" trap. The field is moving toward risk-stratified matching where different product categories and price tiers get different similarity thresholds and review processes. A single algorithm with fixed thresholds will either be too conservative (missing matches) or too aggressive (creating errors) across your diverse catalog.  
