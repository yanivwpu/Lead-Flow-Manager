import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  parsePostPurchaseTemplateBindingChange, readPostPurchaseTemplateBindings,
  eligiblePostPurchaseLibraryTemplate, eligiblePostPurchaseTemplateLookupQuery,
  savePostPurchaseTemplateBindingQuery,
} from "../server/ecommerce/postPurchaseTemplateBinding";

const id = "a1b2c3d4-0000-4000-8000-123456789abc";
const base = { id, twilio_sid:"meta_12345", status:"approved", category:"UTILITY",
  body_text:"Your order {{1}} is confirmed.", template_type:"text",
  header_type:null, buttons:[], carousel_cards:[] };

test("strict editable message selection accepts exactly a journey and library ID or null",()=>{
 assert.deepEqual(parsePostPurchaseTemplateBindingChange({ action:"save_post_purchase_template",
   journey:"orderConfirmation", templateId:id }),{journey:"orderConfirmation",templateId:id});
 assert.deepEqual(parsePostPurchaseTemplateBindingChange({action:"save_post_purchase_template",
   journey:"winBack", templateId:null}),{journey:"winBack",templateId:null});
 for(const value of [
   {action:"save_post_purchase_template",journey:"orderConfirmation",templateId:"../secret"},
   {action:"save_post_purchase_template",journey:"invalid",templateId:id},
   {action:"save_post_purchase_template",journey:"orderConfirmation",templateId:123},
   {action:"save_post_purchase_template",journey:"orderConfirmation",templateId:id,activate:true},
   {action:"send_post_purchase_template",journey:"winBack",templateId:id},
   {action:"save_post_purchase_template",journey:"winBack"},
   [],
 ]) assert.equal(parsePostPurchaseTemplateBindingChange(value),null);
});

test("read bindings ignores corrupt, unknown or oversized values and only supports six journeys",()=>{
 assert.deepEqual(readPostPurchaseTemplateBindings(null),{});
 assert.deepEqual(readPostPurchaseTemplateBindings({ecommercePostPurchaseTemplates:{
   orderConfirmation:id,winBack:id,unknown:id,cancellation:"../evil",reviewRequest:"x".repeat(500),
 }}),{orderConfirmation:id,winBack:id});
});

test("library template binding fails closed for different format, category, status or provider",()=>{
 assert.equal(eligiblePostPurchaseLibraryTemplate(base,"orderConfirmation"),true);
 assert.equal(eligiblePostPurchaseLibraryTemplate({...base,category:"MARKETING"},"orderConfirmation"),false);
 assert.equal(eligiblePostPurchaseLibraryTemplate({...base,category:"MARKETING"},"reviewRequest"),true);
 for(const change of [
  {twilio_sid:"twilio_123"}, {status:"pending"}, {template_type:"carousel"},
  {header_type:"image"}, {buttons:[{type:"URL"}]}, {carousel_cards:[{}]},
  {body_text:"Hello {{2}}"}, {body_text:""}, {body_text:"a".repeat(5000)},
 ]) assert.equal(eligiblePostPurchaseLibraryTemplate({...base,...change},"orderConfirmation"),false);
});

test("lookup and save are scoped to account, installation and shop; no sending or activation",()=>{
 const dialect=new PgDialect();
 const lookup=dialect.sqlToQuery(eligiblePostPurchaseTemplateLookupQuery("owner-1",id));
 assert.match(lookup.sql,/FROM message_templates WHERE id=\$1 AND user_id=\$2 LIMIT 2 FOR SHARE/);
 assert.deepEqual(lookup.params,[id,"owner-1"]);
 const update=dialect.sqlToQuery(savePostPurchaseTemplateBindingQuery({
   integrationId:"install-1",accountId:"owner-1",shop:"owned.myshopify.com",
   journey:"orderConfirmation",templateId:id,
 }));
 for(const required of ["UPDATE integrations","ecommercePostPurchaseTemplates","user_id","is_active IS TRUE","shop","RETURNING"])
   assert.ok(update.sql.includes(required),required);
 assert.doesNotMatch(update.sql,/INSERT INTO message_templates|INSERT INTO.*outbox|send_meta|activated_at/);
 assert.ok(update.params.includes("install-1"));
 assert.ok(update.params.includes("owner-1"));
 assert.ok(update.params.includes("owned.myshopify.com"));
});

test("preview reuses the existing owner-only endpoint and library, with no customer-send controls",()=>{
 const route=readFileSync("server/ecommercePilotRoutes.ts","utf8");
 const preview=readFileSync("client/src/components/ecommerce/ShopifyPostPurchasePreview.tsx","utf8");
 const plans=readFileSync("client/src/components/ecommerce/ShopifyPostPurchasePlans.tsx","utf8");
 assert.match(route,/router\.use\(requireEcommercePilot\)/);
 assert.match(route,/parsePostPurchaseTemplateBindingChange\(req\.body\)/);
 assert.match(route,/eligiblePostPurchaseTemplateLookupQuery\(accountId, templateChange\.templateId\)/);
 assert.match(route,/ecommercePostPurchaseTemplates: saved\.bindings/);
 assert.match(route,/workflowActive: false, messagingEnabled: false/);
 assert.match(preview,/bindings=\{data\.postPurchaseTemplates\}/);
 assert.match(plans,/queryKey: withUserQueryScope\(\["\/api\/templates"\], user\?\.id\)/);
 assert.match(plans,/href="\/app\/templates"/);
 assert.match(plans,/action: "save_post_purchase_template"/);
 assert.match(plans,/result\.messagingEnabled !== false/);
 assert.doesNotMatch(plans,/send-template|send-message|MetaSender|checkoutCreate/);
});
