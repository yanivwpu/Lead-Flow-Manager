/** Run: npx tsx tests/seo-meta-description-quality.test.ts */
import assert from "node:assert/strict";
import { classifyQueryIntent, reviewMetaDescription, type MetaPageEvidence } from "../server/seo/metaDescriptionQuality";

const current="Compare the best WhatsApp CRM platforms in 2026 and learn why businesses are moving toward omnichannel inboxes with AI, automation, Shopify support, and team collaboration.";
const evidence:MetaPageEvidence={title:"Best WhatsApp CRM Platforms in 2026",currentMeta:current,headings:["Compare the best WhatsApp CRM platforms","Omnichannel inboxes","AI and automation","Shopify support","Team collaboration"],bodyText:"A comparison of WhatsApp CRM platforms, omnichannel inboxes, AI, automation, Shopify support and team collaboration.",queryCluster:["best whatsapp crm"],fingerprint:"page-fingerprint",metrics:{clicks:4,impressions:500,position:7}};
assert.equal(classifyQueryIntent(evidence.queryCluster,evidence.title),"comparison");

const generic="Explore WhachatCRM for best whatsapp crm: organize conversations, follow up consistently, and manage customer relationships in one workspace.";
const regression=reviewMetaDescription(current,generic,evidence);
assert.equal(regression.better,false);
assert.ok(regression.reasons.includes("awkward_raw_query"));
assert.ok(regression.reasons.includes("generic_copy"));

const weak={...evidence,currentMeta:"WhatsApp CRM software for businesses. Find out more about our CRM tools and customer communication solution."};
const stronger="Compare WhatsApp CRM platforms by omnichannel inbox, AI automation, Shopify support, and team collaboration to find the right fit for your business.";
assert.equal(reviewMetaDescription(weak.currentMeta,stronger,weak).better,true,"a specific, supported and intent-aligned improvement is accepted");
assert.equal(reviewMetaDescription(current,current,evidence).decision,"no_material_improvement","a strong current meta is retained without a clear gain");
assert.ok(reviewMetaDescription(current,"Best WhatsApp CRM: compare the best WhatsApp CRM and choose the best WhatsApp CRM for your team today.",evidence).reasons.includes("description_length")||reviewMetaDescription(current,"Best WhatsApp CRM: compare the best WhatsApp CRM and choose the best WhatsApp CRM for your team today.",evidence).proposed.keywordStuffingRisk<5);
assert.ok(reviewMetaDescription(weak.currentMeta,"Choose the guaranteed #1 WhatsApp CRM to double your sales with AI automation and Shopify support for every team.",weak).reasons.includes("unsupported_claim"));
assert.ok(reviewMetaDescription(weak.currentMeta,"Explore WhachatCRM to organize conversations, follow up consistently, and manage customer relationships in one workspace.",weak).reasons.includes("generic_copy"));
assert.ok(reviewMetaDescription(weak.currentMeta,"Compare WhatsApp CRM platforms with Instagram integration for modern customer service teams with flexible workflows and unified customer conversations.",{...weak,headings:["WhatsApp CRM comparison"],bodyText:"WhatsApp CRM platform comparison."}).reasons.some(r=>r.startsWith("unsupported_fact:")),"unsupported feature claims are rejected");
console.log("SEO meta description quality tests passed");

import { buildMetaEvidencePacket, generateAndSelectMeta, type MetaCopywriter } from "../server/seo/metaDescriptionQuality";
const mock=(candidates:string[]|Error):MetaCopywriter=>({provider:"mock",model:"test-model",async generate(){if(candidates instanceof Error)throw candidates;return candidates;}});
const weakComparison:MetaPageEvidence={pageUrl:"https://example.com/wati-alternative",title:"WATI Alternative for SMBs",currentMeta:"See our WATI alternative and find a CRM solution for your business team today.",headings:["WATI vs WhachatCRM","Pricing and message markup","Unlimited users and simple setup"],bodyText:"Compare WATI and WhachatCRM for SMBs. WhachatCRM has a free plan, zero message markup, unlimited users, automation, and simple setup.",queryCluster:["wati alternative","wati vs whachatcrm"],fingerprint:"wati-fingerprint",metrics:{clicks:3,impressions:400,position:8}};
const packet=buildMetaEvidencePacket(weakComparison);
assert.equal(packet.pageUrl,weakComparison.pageUrl);assert.equal(packet.h1,"WATI vs WhachatCRM");assert.equal(packet.searchConsole.ctr,3/400);assert.ok(!JSON.stringify(packet).includes("repository"));

const watiCurrent="Switch from WATI to WhachatCRM: $49/mo vs $30+, free plan, zero message markup, unlimited users, simple setup.";
const wati={...weakComparison,currentMeta:watiCurrent,bodyText:`${weakComparison.bodyText} WhachatCRM costs $49/mo and WATI plans start at $30+.`};
const watiBad="Compare Best WATI Alternative for SMBs with criteria grounded in the page. Learn what the page covers and choose the right next step.";
assert.equal(reviewMetaDescription(watiCurrent,watiBad,wati).decision,"no_material_improvement","exact production regression is rejected");
assert.ok((await generateAndSelectMeta(wati,mock([watiBad]))).decision==="no_material_improvement","WATI retains its stronger current meta");

const genericOnly=await generateAndSelectMeta(weakComparison,mock([watiBad,"Explore WhachatCRM and discover an all-in-one solution that takes your business to the next level."]));
assert.equal(genericOnly.decision,"no_material_improvement");
const strong="Compare WATI and WhachatCRM for SMBs by pricing, message markup, unlimited users, automation, and setup differences for growing customer service teams.";
const mixed=await generateAndSelectMeta(weakComparison,mock([watiBad,strong,"Discover the best CRM solution for your business and learn more about customer relationships today."]));
assert.equal(mixed.decision,"accept");assert.equal(mixed.candidate,strong);assert.equal(mixed.audit.selectedCandidateIndex,1);assert.equal(mixed.audit.candidateCount,3);
assert.equal((await generateAndSelectMeta(weakComparison,mock(["Compare WATI and WhachatCRM with SMS, guaranteed savings, automation, and flexible workflows for every growing customer service team."]))).decision,"no_material_improvement","unsupported feature is rejected");
assert.equal((await generateAndSelectMeta(weakComparison,mock(["WATI alternative: compare WATI alternative pricing and choose the best WATI alternative CRM for every WATI alternative business team today."]))).decision,"no_material_improvement","stuffing is rejected");
const differentiated={...weakComparison,currentMeta:"Compare WATI and WhachatCRM for zero message markup, a free plan, unlimited users, automation, and simple setup for growing SMB customer service teams."};
assert.equal((await generateAndSelectMeta(differentiated,mock(["Compare WATI and WhachatCRM automation and setup differences for SMB customer service teams choosing a WhatsApp platform."]))).decision,"no_material_improvement","differentiator loss is rejected");
assert.equal((await generateAndSelectMeta(weakComparison,mock(new Error("provider unavailable")))).decision,"no_material_improvement","provider failure fails closed");
assert.ok(reviewMetaDescription(weakComparison.currentMeta,strong,weakComparison).proposed.naturalLanguage>=9);assert.ok(strong.length>=140&&strong.length<=160,"accepted candidate has snippet length");
