import registry from "./seoPublishedContent.json";
export type PublishedSeoSection={actionId:string;version:number;content:string;placement:"before_final_cta"};
export const SEO_CONTENT_ROUTES=["/respond-io-alternative","/zoko-alternative","/blog/automate-whatsapp-messages-small-business"] as const;
export const SEO_CONTENT_PLACEMENT="End of page content, before the final call to action";
export function supportsSeoContentRoute(url:string){try{const u=new URL(url,"https://www.whachatcrm.com");return ["www.whachatcrm.com","whachatcrm.com"].includes(u.hostname)&&!u.search&&!u.hash&&(SEO_CONTENT_ROUTES as readonly string[]).includes(u.pathname);}catch{return false;}}
export function publishedSeoSection(path:string):PublishedSeoSection|null{return (registry as Record<string,PublishedSeoSection>)[path]??null;}
export function seoContentBlocks(content:string){return content.trim().split(/\n\s*\n/).map((text,i)=>({heading:/^#{1,3}\s+/.test(text)||(i===0&&!/[.!?]$/.test(text)&&text.length<130),text:text.replace(/^#{1,3}\s+/,"").trim()}));}
export function publishedSeoHtml(path:string){const section=publishedSeoSection(path);if(!section)return"";const escape=(s:string)=>s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");return `<section data-seo-action="${escape(section.actionId)}" data-seo-version="${section.version}">${seoContentBlocks(section.content).map(b=>b.heading?`<h2>${escape(b.text)}</h2>`:`<p>${escape(b.text)}</p>`).join("\n")}</section>`;}
