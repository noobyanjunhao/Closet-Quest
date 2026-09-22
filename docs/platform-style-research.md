# Public fashion platform study

Reviewed official public pages on 22 September 2026 to refine Closet Quest's presentation. This is a small design reference study, not a ranking of platforms or a claim about conversion performance. Observations below come from accessible public page content; an independent browser screenshot session was unavailable. Implementation choices are our interpretation of those observations.

## Sources and useful principles

| Reference | Observed pattern | Original application in Closet Quest |
| --- | --- | --- |
| [COS — women's new arrivals](https://www.cos.com/en-us/women/new-arrivals) | Product names and imagery sit within a catalog organized by garment categories, with filter/sort controls separated from the products. The collection mixes knitwear, tailoring, and accessories. | A quieter wardrobe grid: rectangular photograph frames, less card decoration, readable names immediately below, and category/sort/search controls aligned in one browsing area. Full garment photographs use `object-fit: contain` so shape is easier to assess. |
| [Zara — US collection](https://www.zara.com/us/) and [knitwear category](https://www.zara.com/us/en/woman-knitwear-l1152.html) | Navigation distinguishes editorial/lookbook material from garment categories such as sweaters, cardigans, and basics. | A small editorial introduction above the practical catalog. Its photos are explicitly labeled as pieces in focus, rather than presented as an AI-generated complete outfit. One action leads into styling. |
| [UNIQLO — The Modern Layering Guide](https://www.uniqlo.com/us/en/contents/lifewear-magazine/the-modern-layering-guide/) | The guide explains combinations through concrete ideas: variations in tone, differences in texture, and combinations of everyday and more structured pieces. | The hero uses an original warm-paper and olive treatment and shows a compact palette from the selected garments' saved color metadata. It invites recombination of owned clothing without claiming new trend expertise or recommending a purchase. |

Four principles guided the implementation:

1. **Give the clothes more space than the interface.** The hero gives more room to existing photographs; catalog cards lose their surrounding boxes, raised hover treatment, and decorative rounded frames. Garment names, review notices, and wear metadata remain available.
2. **Separate inspiration from finding a piece.** The editorial introduction sets a mood. The wardrobe below remains a straightforward, searchable catalog. The hero's selection favors reviewed, less-worn photographs across different garment categories; it is not a validated outfit.
3. **Use the wardrobe's actual colors.** The small palette is derived from the displayed pieces' saved hex colors. It does not sample retailer images, add imported products, or imply that an approximate AI color is verified. Color names remain available to assistive technology and via tooltips.
4. **Keep the short path short.** Preserve Closet, Stylist, Saved looks, and More; one styling call to action; the simplified outfit brief; and secondary controls inside disclosures. Category/search/sort get consistent visual treatment without introducing another strip of filters.

## Changes made

- `src/Editorial.jsx`: original headline and shorter copy; one retained styling action; live usable-piece and review counts; wardrobe-derived palette; removal of decorative photo numbering.
- `src/editorial.css`: lighter image-led introduction, restrained olive and ink, flat catalog cards, full garment visibility, and matching mobile layouts. Existing focus indicators and reduced-motion behavior are retained.
- `src/simple-flow.css`: quieter browsing controls, section divider, and consistent rectangular action/menu treatment. No extra controls or navigation destinations.

All photography remains the app's existing licensed sample imagery or the user's own uploaded photographs. No retailer imagery, product descriptions, logos, assets, or distinctive page layout were copied. Retailer observations informed general presentation principles; Closet Quest retains its own visual identity and wardrobe-first purpose. This visual work does not modify retrieval ranking, AI prompts, or the Plan A model pipeline.

Separately, the [hybrid retrieval implementation](hybrid-retrieval.md) adds two concise original styling cards inspired by the UNIQLO reference: tonal texture and structured/relaxed combinations. They retain source attribution and are retrieved only for relevant briefs. They are authored guidance, not retailer training data.

## Verification

The changed JSX and CSS are parsed using the installed esbuild compiler. Final desktop/mobile browser review is performed with the integrated application by the main development task. Check that portrait and landscape clothing images remain fully visible, empty and one-photo wardrobes still render, the palette adds no focus stops, and the More menu retains its existing touch and keyboard behavior.
