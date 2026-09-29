export type QueryIntent="comparison"|"alternative"|"commercial"|"informational"|"branded"|"feature_product"|"integration"|"pricing";

export type MetaPageEvidence={
  title:string;currentMeta:string;headings:string[];bodyText:string;pageType?:string;
  queryCluster:string[];fingerprint:string;metrics:{clicks:number;impressions:number;position:number};
  otherPageMetas?:string[];
};
export type MetaQualityScore={pageRelevance:number;queryIntentAlignment:number;naturalLanguage:number;specificity:number;usefulDifferentiation:number;factualAccuracy:number;keywordStuffingRisk:number;unsupportedClaimRisk:number;uniqueness:number;searchResultUsefulness:number;total:number};
export type MetaQualityReview={better:boolean;decision:"accept"|"no_material_improvement";intent:QueryIntent;current:MetaQualityScore;proposed:MetaQualityScore;reasons:string[]};

const words=(s:string)=>(s.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[]);
const normalized=(s:string)=>words(s).join(" ");
export function classifyQueryIntent(cluster:string[],pageTitle=""):QueryIntent{const q=`${cluster.join(" ")} ${pageTitle}`.toLowerCase();if(/\b(?:vs|versus|compare|comparison|best|top)\b/.test(q))return"comparison";if(/\balternatives?\b/.test(q))return"alternative";if(/\b(?:price|pricing|cost|plan)\b/.test(q))return"pricing";if(/\b(?:integrat(?:e|ion)|connect(?:or)?)\b/.test(q))return"integration";if(/\bwhachat(?:crm)?\b/.test(cluster.join(" ").toLowerCase()))return"branded";if(/\b(?:how|what|why|guide|learn)\b/.test(q))return"informational";if(/\b(?:feature|inbox|automation|crm|whatsapp)\b/.test(q))return"feature_product";return"commercial";}

const generic=/\b(?:explore whachatcrm|organize conversations|follow up consistently|manage customer relationships|all[- ]in[- ]one solution|take your business to the next level)\b/i;
const unsupported=/\b(?:guarantee(?:d)?|#\s*1|number one|best in the world|100\s*%|double (?:your|their) (?:sales|revenue)|save \d+|trusted by \d+)\b/i;
const featureTerms=["shopify","ai","automation","omnichannel","instagram","sms","team collaboration","shared inbox","whatsapp"];
function score(description:string,e:MetaPageEvidence,intent:QueryIntent,isProposal:boolean):{score:MetaQualityScore;reasons:string[]}{
 const reasons:string[]=[],text=normalized(description),page=normalized(`${e.title} ${e.headings.join(" ")}`),evidence=normalized(`${e.title} ${e.currentMeta} ${e.headings.join(" ")} ${e.bodyText}`),queryTerms=[...new Set(e.queryCluster.flatMap(words).filter(w=>w.length>2&&!['best','the','for','with'].includes(w)))],overlap=queryTerms.filter(w=>text.includes(w)).length;
 const rawQuery=e.queryCluster.some(q=>new RegExp(`\\bfor\\s+${normalized(q).replace(/ /g,"\\s+")}\\b`,"i").test(description));
 if(description.length<70||description.length>165)reasons.push("description_length");
 if(rawQuery)reasons.push("awkward_raw_query");if(generic.test(description))reasons.push("generic_copy");if(unsupported.test(description))reasons.push("unsupported_claim");
 if(!words(e.title).filter(w=>w.length>3).some(w=>text.includes(w))&&overlap===0)reasons.push("missing_page_topic");
 if(/[,:;\-–—]\s*$/.test(description)||/\.{3}$/.test(description))reasons.push("broken_or_truncated");
 if(e.otherPageMetas?.some(meta=>normalized(meta)===text))reasons.push("duplicate_meta");
 if(isProposal)for(const term of featureTerms)if(text.includes(term)&&!evidence.includes(term))reasons.push(`unsupported_fact:${term}`);
 const specificity=Math.min(10,3+overlap+featureTerms.filter(t=>text.includes(t)&&evidence.includes(t)).length);
 const intentAligned=intent==="comparison"?/\b(?:compare|platforms?|options?|choose|which)\b/i.test(description):intent==="pricing"?/\b(?:price|pricing|plans?|cost)\b/i.test(description):intent==="alternative"?/\balternatives?\b/i.test(description):overlap>0;
 const values={pageRelevance:Math.min(10,4+overlap),queryIntentAlignment:intentAligned?9:4,naturalLanguage:rawQuery||generic.test(description)?2:9,specificity,usefulDifferentiation:Math.min(10,2+featureTerms.filter(t=>text.includes(t)&&evidence.includes(t)).length*2),factualAccuracy:reasons.some(r=>r.startsWith("unsupported"))?1:10,keywordStuffingRisk:rawQuery||queryTerms.some(w=>(text.match(new RegExp(`\\b${w}\\b`,"g"))??[]).length>2)?2:10,unsupportedClaimRisk:reasons.some(r=>r.startsWith("unsupported"))?1:10,uniqueness:reasons.includes("duplicate_meta")?0:9,searchResultUsefulness:generic.test(description)?3:Math.min(10,4+specificity/2)};
 return{score:{...values,total:Object.values(values).reduce((a,b)=>a+b,0)},reasons};
}
export function reviewMetaDescription(current:string,proposed:string,evidence:MetaPageEvidence):MetaQualityReview{const intent=classifyQueryIntent(evidence.queryCluster,evidence.title),a=score(current,evidence,intent,false),b=score(proposed,evidence,intent,true),lessSpecific=b.score.specificity<a.score.specificity,losesDifferentiation=b.score.usefulDifferentiation<a.score.usefulDifferentiation;if(lessSpecific)b.reasons.push("less_specific_than_current");if(losesDifferentiation)b.reasons.push("removes_existing_differentiators");const hard=b.reasons.length>0,better=!hard&&b.score.total>=a.score.total+5;return{better,decision:better?"accept":"no_material_improvement",intent,current:a.score,proposed:b.score,reasons:better?[]:[...new Set(b.reasons.length?b.reasons:["quality_gain_below_threshold"])]};}

/** Deterministic, first-party-only drafting. It deliberately preserves a strong current meta. */
export function generatePageAwareMeta(e:MetaPageEvidence){const intent=classifyQueryIntent(e.queryCluster,e.title),currentReview=score(e.currentMeta,e,intent,false);if(e.currentMeta&&currentReview.reasons.length===0&&currentReview.score.total>=70)return e.currentMeta;const title=e.title.replace(/\s*[|–—-]\s*Whachat(?:CRM)?\b.*$/i,"").trim();const supported=e.headings.map(h=>h.replace(/[.!?]+$/,"" ).trim()).filter(h=>h.length>=8&&h.length<=55).slice(0,2);const detail=supported.length?` Explore ${supported.join(" and ").toLowerCase()}.`:" Learn what the page covers and choose the right next step.";const lead=intent==="comparison"?`Compare ${title} with criteria grounded in the page.`:`Learn about ${title} from WhachatCRM.`;return `${lead}${detail}`.slice(0,165).replace(/\s+\S*$/,m=>lead.length+detail.length>165?"…":m);}
