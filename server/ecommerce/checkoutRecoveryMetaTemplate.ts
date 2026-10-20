/** Pure, dependency-free Meta recovery template guards. */
export type RecoveryTemplateShape = {
  name: string; language: string; category: string; status: string;
  bodyText: string | null; headerType?: string | null;
  templateType?: string | null; buttons?: unknown; carouselCards?: unknown;
};
const EXACT_LINK_PLACEHOLDER = /\{\{1\}\}/g;

function plainObject(value:unknown):Record<string,unknown>{
  return value && typeof value==='object' && !Array.isArray(value)
    ? value as Record<string,unknown> : {};
}
/**
 * Recovery currently supports ONLY an approved Meta MARKETING, text-body
 * template with a single {{1}} variable. No unknown dynamic header, media,
 * buttons, URL suffixes, carousels, or unsubstituted variables can leak into
 * customer sends. Using a single body placeholder ensures a full validated
 * Shopify checkout link is passed without guessing Meta button URL prefixes.
 */
export function validateRecoveryMetaTemplate(
 local:RecoveryTemplateShape|null,
 live:unknown,
): {ok:true;name:string;language:string;components:Record<string,unknown>[]} |
   {ok:false;reason:string} {
 const blocked=(reason:string):{ok:false;reason:string}=>({ok:false,reason});
 if(!local || !live || typeof live!=='object' || Array.isArray(live))
   return blocked('missing_approved_marketing_template');
 const raw=live as Record<string,unknown>;
 if(typeof raw.name!=='string' || typeof raw.language!=='string' ||
    raw.name!==local.name || raw.language!==local.language ||
    local.status.toLowerCase()!=='approved' ||
    String(raw.status).toUpperCase()!=='APPROVED' ||
    local.category.toLowerCase()!=='marketing' ||
    String(raw.category).toUpperCase()!=='MARKETING')
   return blocked('template_not_currently_approved');
 if(!/^[a-z][a-z0-9_]{0,511}$/.test(local.name) ||
    !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(local.language) ||
    (local.headerType && local.headerType.toLowerCase()!=='none') ||
    (local.templateType && local.templateType.toLowerCase()!=='text') ||
    (Array.isArray(local.buttons) && local.buttons.length>0) ||
    (Array.isArray(local.carouselCards) && local.carouselCards.length>0))
   return blocked('unsupported_recovery_template_shape');
 if(typeof local.bodyText!=='string' ||
    (local.bodyText.match(EXACT_LINK_PLACEHOLDER)||[]).length!==1 ||
    /\{\{(?!1\}\})\d+\}\}/.test(local.bodyText))
   return blocked('unsupported_recovery_body_variables');
 const components=raw.components;
 if(!Array.isArray(components) || !components.length ||
    components.some(component=>{
      const item=plainObject(component);
      return item.type!=='BODY' && item.type!=='FOOTER';
    }))
   return blocked('unsupported_meta_components');
 const body=components.map(plainObject).filter(c=>c.type==='BODY');
 if(body.length!==1 || body[0].text!==local.bodyText ||
    (String(body[0].text||'').match(EXACT_LINK_PLACEHOLDER)||[]).length!==1)
   return blocked('meta_body_does_not_match_library');
 return {ok:true,name:local.name,language:local.language,
   components:[{type:'body',parameters:[]}]};
}
export function recoveryTemplateBodyComponents(
 approved:Extract<ReturnType<typeof validateRecoveryMetaTemplate>,{ok:true}>,
 recoveryUrl:string
):Record<string,unknown>[] {
 if(typeof recoveryUrl!=='string' || recoveryUrl.length>2048)throw Error('invalid_recovery_url');
 let url:URL;
 try {url=new URL(recoveryUrl);}catch{throw Error('invalid_recovery_url');}
 if(url.protocol!=='https:'||url.username||url.password||url.hash||url.port||
    !url.pathname.includes('/checkouts/')||!url.pathname.includes('/recover'))
    throw Error('invalid_recovery_url');
 return [{type:'body',parameters:[{type:'text',text:url.toString()}]}];
}

