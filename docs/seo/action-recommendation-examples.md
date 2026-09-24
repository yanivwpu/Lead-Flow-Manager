# SEO action recommendation examples

These are **local synthetic fixture results**, produced by `scripts/seo-action-fixture-examples.ts` through the production `clusterAndScoreOpportunities` and `buildProposal` functions. They are not fresh Search Console measurements or production findings.

## `/real-estate-crm`

**Before (retired generic template)**

> Explore WhachatCRM for real estate crm for whatsapp leads: organize conversations, follow up consistently, and manage customer relationships in one workspace.

**After (actual fixture output)**

> Real Estate CRM for Agents & Teams: Capture WhatsApp property inquiries, assign each lead to an agent, and keep qualification notes and follow-up in one…

**Why:** The fixture has 200 impressions, one click, and average position 8, so its documented low-CTR rule identifies a plausible snippet issue. The replacement uses only the fixture snapshot's verified title and body facts. It replaces the current fixture description, “A CRM for real estate teams.” No competitor research was supplied.

## `/best-whatsapp-crm-2026`

**Before (retired generic template)**

> Expand the existing page with an original section that directly answers the target query, covering workflow, fit, and next steps.

**After (actual fixture output)**

> No change recommended.

**Why:** The fixture reproduces the 113-impression versus 2-impression materiality scenario and uses the query “best whatsapp crm with ai automation and omnichannel team inbox in 2026.” Its first-party fixture text already covers the WhatsApp CRM, AI, automation, omnichannel, team-inbox, and 2026 topics. Adding another section would be filler, so the generator returns an insufficient-evidence state instead of a review-ready action.

## `/zoko-alternative`

**Before (retired generic template)**

> Expand the existing page with an original section that directly answers the target query, covering workflow, fit, and next steps.

**After (actual fixture output)**

> No change recommended.

**Why:** The fixture reproduces the 959-impression versus 3-impression materiality scenario. The captured heading and body already directly cover “Zoko alternative,” so the generator does not manufacture an expansion. The incidental homepage impressions remain diagnostic evidence and do not become a cannibalization proposal.

In every case, approval remains non-publishing. A review-ready result carries the URL, current and proposed values, exact target, acceptance checks, snapshot rollback reference, and an unresolved repository target unless source mapping is established separately.

## Supported content-expansion fixture

The production generation path produces the following complete draft when a question is absent but the snapshot contains directly relevant, verified workflow facts:

> ## What happens after a property inquiry arrives
>
> The verified workflow described on this page is: Capture property inquiries from WhatsApp, assign leads to agents, and record follow-up in one shared inbox.

This answer selects the relevant workflow evidence rather than copying the first 180 characters of the page.

## Unsupported content-expansion fixture

For the fixture query `whatsapp crm pricing`, the snapshot contains only conversation-routing evidence. The production path rejects the proposal with:

> The snapshot does not contain verified facts that answer “whatsapp crm pricing”

No pricing, product, or competitor claim is inferred.
