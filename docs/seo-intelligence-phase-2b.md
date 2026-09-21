# SEO Intelligence Phase 2B

## Scope and current-state assessment

Phase 2A safely imports property-scoped Google Search Console facts, reconciles daily totals, detects basic opportunities, and uses a fenced execution lease. It did not persist opportunity clusters, page/competitor evidence, recommendation versions, or approval decisions. Phase 2B extends that system; it does not replace the importer and has no website-writing capability.

Phase 2B detects and persists bounded opportunities, creates evidence-linked approval-ready actions, versions their structured proposal, and records immutable lifecycle events. Approval records intent only. It **never publishes**, modifies repository/public content, changes a Search Console property, or enters `executing`.

## Configuration and discovery

Existing Search Console variables remain required (`GOOGLE_SEARCH_CONSOLE_SITE_URL` and the existing Google credential variables). Automatic organic-result discovery is deliberately `not_configured`: `OrganicSearchProvider` is an explicit abstraction and returns no invented rankings until an approved provider is integrated. `OPENAI_API_KEY` is optional in this release because the safe deterministic planner is used. Manual competitor domains/pages are stored in `seo_competitor_config` for future research adapters.

Research cache identity uses bounded SHA-256 query/page keys and an expiry. Fetches accept only HTTP(S) without credentials or custom ports, resolve every host to public IPs, revalidate redirects, cap redirects/time/body size/concurrency/run volume, validate HTML content type, support robots-policy denial, and apply per-host pacing. Authentication, paywalls, CAPTCHAs, and access controls must never be bypassed. Partial page failures are categorized rather than replaced with fabricated evidence.

## Scoring and lifecycle

Scoring groups semantically overlapping queries on their canonical page, suppresses low-impression noise, and combines impression volume, CTR upside, period loss, striking-distance position, and commercial-intent terms. Confidence increases with evidence volume and availability of a prior period. Inputs, reason, score, confidence, upside, and evidence are persisted so the result is explainable and reproducible.

The full future lifecycle is `detected → researching → proposed → approved/rejected → executing → measuring → kept/revision_required/rolled_back/failed`. Phase 2B permits transitions only through approval/rejection (and regeneration back to research). A partial unique index prevents duplicate open actions. Every transition appends an audit event; proposal content is immutable by version and retains provider/model/prompt version plus the original SHA-256 content fingerprint.

## Safe rollout

1. Back up and verify the target database; deploy application code without changing Railway/Neon settings.
2. Apply `0095_seo_action_planner.sql` after `0094`; startup provisioning applies the same forward-only objects idempotently.
3. Confirm the startup schema probe and existing Search Console sync, then open Sales Admin → SEO Intelligence.
4. Run **Analyze opportunities** once. Verify count-only run diagnostics and inspect proposals/evidence.
5. Approve/reject a low-risk test proposal and confirm public pages and repository content are unchanged.
6. Leave automatic discovery disabled until an approved provider and credential are configured and its terms, privacy, quota, and result accuracy are reviewed.

Do not run integration tests unless `TEST_DATABASE_URL` identifies a disposable PostgreSQL database. Never point tests at production.

## Phase 2C handoff

Phase 2C should add a separately permissioned executor with repository/page adapters, fingerprint preconditions, preview diffs, two-person approval for medium/high risk, allowlisted mutation types, atomic version capture, canary rollout, and immediate rollback. It should record Search Console baselines and evaluate 7/14/28-day click, impression, CTR, and position deltas against controls; only then may actions become `kept`, `revision_required`, or `rolled_back`. Execution must use a distinct lease, budgets, kill switch, tenant/property fencing, and never infer success from publishing alone.

## Review corrections

Production planning now reads raw current/previous Search Console rows and passes them through the canonical-page cluster scorer. Before a proposal is created, the target page is safely retrieved and normalized into canonical URL, title, description, H1–H3 headings, indexable body text, JSON-LD, and internal links. Each immutable recommendation version references that snapshot. A later analysis marks an open action stale when the current fingerprint differs.

Metadata templates bound untrusted query text before validation and each opportunity has its own sanitized failure boundary. Refresh atomically claims a proposed action, captures fresh page evidence, creates exactly one new version, and returns it to proposed; a failed refresh restores the prior proposed state. Cannibalization remains high-risk human review and retains every competing page—no redirects, canonicals, merges, or deletions are performed.

## Candidate and commit safety

Planner input is bounded in PostgreSQL before Node materializes or clusters it. The current hard ceiling is 2,000 query/page identities per property and analysis run. SQL aggregates the 56-day window, applies striking-distance, low-CTR, and meaningful-decline predicates over the current/previous union, orders by deterministic evidence strength plus the bounded natural-key hash, and only then applies `LIMIT`. Diagnostics retain eligible, loaded, and cap-omitted counts.

Creation of a recommendation is atomic: its action, initial immutable version, opportunity evidence reference, and initial lifecycle event commit in one transaction. A duplicate open-action key performs an idempotent skip. Migration 0097 preserves but quarantines any legacy action without a version as `failed` and appends a repair audit event; it never deletes recommendation history.
