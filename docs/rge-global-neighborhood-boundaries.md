# Realtor Growth Engine — worldwide neighborhood boundaries

Status: **country-aware service-area authoring implemented, global Overture coverage NOT published until reviewed data is supplied.** Never describe the current South Florida GIS provider registry as global.

## Trusted source precedence
1. Official, city-scoped municipal GIS exact polygon. This has precedence even when an agent has saved their own geometry.
2. Reviewed curated Overture \`division_area\` neighborhood/microhood polygon (feature flag off by default).
3. Explicit owner-drawn polygon, labeled **Agent-defined service area**. Only when sources are unsupported or truly unmatched. A temporary outage, stale source, duplicate match or invalid source must never switch to a guessed area.
4. Otherwise show no matched local properties and an honest unsupported/unavailable statement.

All paths use point-in-polygon (including holes/multipolygons for trusted sources). They keep workspace ownership, public MLS display/attribution, restricted-address, status, 14-day inventory freshness, and lead-flow restrictions. No ZIP-city rectangle, fuzziness, radius, or city-substring results. Published page URLs/slugs and existing US defaults are unchanged.

## Overture source facts / provenance
The Overture Maps divisions theme uses ODbL because it includes OpenStreetMap and geoBoundaries sources. Official docs:
- https://docs.overturemaps.org/guides/divisions/
- https://docs.overturemaps.org/schema/reference/divisions/division_area/
- https://docs.overturemaps.org/attribution/

Display credit: **© OpenStreetMap contributors, Overture Maps Foundation** and link to licensing where relevant. The data may carry additional upstream attribution obligations. Overture's locality and neighborhood coverage is geographically spotty; source polygons are approximations, not property/legal jurisdiction boundaries.

A \`division_area\` may not directly carry a fully resolved, human-readable city. Preprocess the \`division\` hierarchy OUTSIDE the application and independently establish country (ISO alpha-2), region/state and city before importing. Do not assume the same-named area belongs to the nearest city.

## Offline ingestion and controlled activation
The importer script expects an up-to-500-item JSON array of objects with:
\`{country,state,city,name,sourceId,sourceVersion,subtype,license,attribution,geometry,retrievedAt}\`

Source version: e.g. \`2026-11-18.0\`; subtype \`neighborhood\` or \`microhood\`. Geometry is GeoJSON Polygon/MultiPolygon in EPSG:4326 (longitude, latitude). The script rejects missing IDs, oversized regions, stale release inputs, bad polygons, absent attribution and any license other than ODbL-1.0. Do not pass raw multi-terabyte Parquet to production.

Dry run (the only default):
\`node --import tsx scripts/import-curated-neighborhood-boundaries.ts ./reviewed-candidates.json\`

Operator-only append of **unreviewed** data:
\`RGE_CURATED_BOUNDARY_IMPORT_ALLOWED=true node --import tsx scripts/import-curated-neighborhood-boundaries.ts ./reviewed-candidates.json --apply\`

New rows are \`reviewed=false\` and therefore invisible. For EACH imported source, inspect city hierarchy, geometry, duplicates, ODbL obligations and data freshness; record human approval evidence in an audit ticket, then mark that source reviewed through an audited database operation. Never bulk-approve a dataset without a data-quality sample and legal licensing review. Source identity is unique and re-import cannot silently replace previously reviewed geometry.

Only when approved records exist and the legal/data-review gate passes, set \`RGE_OVERTURE_BOUNDARIES_ENABLED=true\` in a controlled environment. Always verify country/locality duplicate names, source outage, public attribution, mobile preview, and no unrelated listing exposure. Keep the flag off on production until authorized.

## Agent-defined area UX
The owner-only editor is an optional map-drawing aid. It supports pan/zoom, pointer-added corners and keyboard coordinates; an area must be a small simple polygon with a closed ring, fewer than 121 corners, no holes/self-intersections, and <=0.5 degrees height/width. All shape checks run again on the authenticated server and when rendering; the stored geometry is tenant-owned. A change to location identity clears the local draft outline so a previous city can never be silently claimed under another name.

OSM raster tiles are a base map, NOT a verified source of municipal boundaries. Follow https://operations.osmfoundation.org/policies/tiles/ (attribution, Referer, caching, no bulk downloads). If tiles are unavailable, coordinate entry still works.

## Release checklist
- [x] Exact municipal GIS for Fort Lauderdale, Miami and Pompano Beach, with fail-closed handling
- [x] Neighborhood property filtering and safe per-category pagination; note 3,000 candidate scan bound
- [ ] Country/Unicode migration and owner map editor through CI, production smoke test, and one real publish
- [ ] Real curated Overture batch with approval, legal review and user-visible attribution in selected countries
- [ ] Multi-currency MLS source support and feeds outside currently-authorized US coverage (separate MLS licensing work)
- [ ] Full coverage claims only when measured: report unsupported and unresolved country/city pairs honestly
