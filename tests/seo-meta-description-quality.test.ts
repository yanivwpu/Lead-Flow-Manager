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
