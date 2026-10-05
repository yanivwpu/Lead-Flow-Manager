import { supportsSeoContentRoute } from "../../shared/seoPublishedContent";
import ts from "typescript";
import { captureFirstPartyPage } from "./firstPartyPage";
import { validateRecommendationOutput, type SeoRecommendationOutput } from "./actionPlanner";

export const SEO_GITHUB_BASE_BRANCH = "main";
export const SEO_GITHUB_ALLOWED_FILES = ["server/seo.ts", "shared/seoPublishedContent.json"] as const;
export type SeoGithubExecutionInput={
  actionId:string; actionVersion:number; targetPage:string; actionType:string; originalContentFingerprint:string;
  opportunityType:string; evidence:unknown; proposal:SeoRecommendationOutput;
};
export type SeoGithubExecutionResult={branchName:string;commitSha:string;prNumber:number;prUrl:string;changedFiles:string[]};
export type SeoGithubConfig={token:string;owner:string;repo:string;apiUrl:string};

export class SeoGithubExecutionError extends Error{constructor(public code:string,message:string){super(message);this.name="SeoGithubExecutionError";}}

export function resolveSeoGithubConfig(env:NodeJS.ProcessEnv=process.env):SeoGithubConfig{
  const token=env.SEO_GITHUB_TOKEN?.trim(),owner=env.SEO_GITHUB_OWNER?.trim(),repo=env.SEO_GITHUB_REPO?.trim();
  const missing=[!token&&"SEO_GITHUB_TOKEN",!owner&&"SEO_GITHUB_OWNER",!repo&&"SEO_GITHUB_REPO"].filter(Boolean);
  if(missing.length)throw new SeoGithubExecutionError("GITHUB_NOT_CONFIGURED",`SEO GitHub execution is not configured; missing ${missing.join(", ")}`);
  return{token:token!,owner:owner!,repo:repo!,apiUrl:(env.SEO_GITHUB_API_URL?.trim()||"https://api.github.com").replace(/\/+$/,"")};
}

export function safeGithubExecutionError(error:unknown,config?:Partial<SeoGithubConfig>){
  let message=error instanceof Error?error.message:String(error);
  for(const secret of [config?.token,process.env.SEO_GITHUB_TOKEN])if(secret)message=message.split(secret).join("[redacted]");
  return message.replace(/(?:token|bearer)\s+[A-Za-z0-9._-]+/gi,"[redacted]").replace(/https?:\/\/[^\s@]+@/g,"https://[redacted]@").replace(/\s+/g," ").slice(0,500);
}

export function seoBranchName(actionId:string,now=new Date()){
  const compact=actionId.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,24)||"action";
  return `seo/${compact}-${now.toISOString().replace(/[-:.TZ]/g,"").slice(0,14)}`;
}
export function assertSafeSeoBranch(branch:string){if(branch===SEO_GITHUB_BASE_BRANCH||branch===`refs/heads/${SEO_GITHUB_BASE_BRANCH}`||!/^seo\/[a-z0-9][a-z0-9-]{2,80}$/.test(branch))throw new SeoGithubExecutionError("UNSAFE_BRANCH","SEO execution may only push a generated seo/* branch");}
export function assertAllowedSeoFile(path:string){if(!(SEO_GITHUB_ALLOWED_FILES as readonly string[]).includes(path))throw new SeoGithubExecutionError("FILE_NOT_ALLOWLISTED",`SEO execution cannot modify non-allowlisted file: ${path}`);}

export function applySeoProposalToSource(path:string,source:string,targetPage:string,proposalInput:unknown){
  assertAllowedSeoFile(path);
  const proposal=validateRecommendationOutput(proposalInput);
  if(path==="shared/seoPublishedContent.json"){
    if(proposal.actionType!=="content_expansion"||!supportsSeoContentRoute(targetPage)||!proposal.proposedContent||proposal.factValidationStatus!=="passed"||proposal.risk==="high")throw new SeoGithubExecutionError("ACTION_NOT_ALLOWLISTED","Publishing requires a finished, fact-validated draft on a supported page");
    const registry=JSON.parse(source),route=new URL(targetPage).pathname;
    if(!registry||Array.isArray(registry)||typeof registry!=="object")throw new SeoGithubExecutionError("INVALID_REGISTRY","Invalid SEO content registry");
    const entry={content:proposal.proposedContent,placement:"before_final_cta"};
    return{path,route,content:JSON.stringify({...registry,[route]:entry},null,2)+"\n",before:JSON.stringify(registry[route]??null),after:JSON.stringify(entry)};
  }
  if(proposal.actionType!=="meta_description"||!proposal.proposedMetaDescription)throw new SeoGithubExecutionError("ACTION_NOT_ALLOWLISTED","Only exact meta_description proposals are currently executable");
  const route=new URL(targetPage).pathname.replace(/\/$/,"")||"/";
  const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  let replacement:{start:number;end:number}|undefined;
  const inspect=(node:ts.Node)=>{
    if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==="PAGE_META"&&node.initializer&&ts.isObjectLiteralExpression(node.initializer)){
      const page=node.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&((ts.isStringLiteral(p.name)&&p.name.text===route)||(ts.isComputedPropertyName(p.name)&&false))) as ts.PropertyAssignment|undefined;
      if(page&&ts.isObjectLiteralExpression(page.initializer)){
        const description=page.initializer.properties.find(p=>ts.isPropertyAssignment(p)&&((ts.isIdentifier(p.name)&&p.name.text==="description")||(ts.isStringLiteral(p.name)&&p.name.text==="description"))) as ts.PropertyAssignment|undefined;
        if(description&&(ts.isStringLiteral(description.initializer)||ts.isNoSubstitutionTemplateLiteral(description.initializer)))replacement={start:description.initializer.getStart(ast),end:description.initializer.getEnd()};
      }
    }
    ts.forEachChild(node,inspect);
  };
  inspect(ast);
  if(!replacement)throw new SeoGithubExecutionError("PAGE_ADAPTER_NOT_FOUND",`No allowlisted PAGE_META adapter exists for ${route}`);
  const updated=source.slice(0,replacement.start)+JSON.stringify(proposal.proposedMetaDescription)+source.slice(replacement.end);
  return{content:updated,path,route,before:source.slice(replacement.start,replacement.end),after:JSON.stringify(proposal.proposedMetaDescription)};
}

type ApiFetch=typeof fetch;
export async function githubRequest<T>(config:SeoGithubConfig,path:string,init:RequestInit={},fetchImpl:ApiFetch=fetch):Promise<T>{
  const response=await fetchImpl(`${config.apiUrl}/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}${path}`,{...init,headers:{accept:"application/vnd.github+json",authorization:`Bearer ${config.token}`,"x-github-api-version":"2022-11-28","content-type":"application/json",...init.headers}});
  if(!response.ok){const requestId=response.headers.get("x-github-request-id");throw new SeoGithubExecutionError("GITHUB_API_FAILED",`GitHub API ${init.method??"GET"} ${path} failed (${response.status})${requestId?` request ${requestId}`:""}`);}
  return await response.json() as T;
}

export function buildSeoPullRequestMetadata(input:SeoGithubExecutionInput,change:{route:string;before:string;after:string}){
  const topic=((input.proposal.proposedMetaDescription||input.targetPage).replace(/[^\p{L}\p{N} ]/gu," ").replace(/\s+/g," ").trim().slice(0,60)||change.route);
  const body=[
    "## SEO Intelligence proposal",
    `- **Opportunity type:** ${input.opportunityType}`,
    `- **Affected page:** ${input.targetPage}`,
    `- **Action / proposal:** ${input.actionId} / v${input.actionVersion}`,
    `- **Search Console evidence:** ${JSON.stringify(input.evidence).slice(0,1500)}`,
    "",
    "## Proposed change",
    input.proposal.explanation,
    "",
    "## Before / after",
    `- **Before:** ${change.before.slice(0,500)}`,
    `- **After:** ${change.after.slice(0,500)}`,
    "",
    input.actionType==="content_expansion"?"> Generated by SEO Intelligence. Guarded SEO Autopilot may merge and deploy this allowlisted draft after confidence, quality, GitHub checks, stale-content protection, and live verification pass. Placement: end of page content, before final call to action.":"> Generated by SEO Intelligence. Guarded SEO Autopilot may merge and deploy this metadata change after confidence, quality, GitHub checks, stale-content protection, and live verification pass.",
  ].join("\n");
  return{title:`SEO: Improve ${topic}`,body};
}

export async function executeSeoGithubPullRequest(input:SeoGithubExecutionInput,deps:{config?:SeoGithubConfig;fetchImpl?:ApiFetch;capturePage?:typeof captureFirstPartyPage;now?:Date;branchName?:string;onProgress?:(progress:Partial<SeoGithubExecutionResult>)=>Promise<void>|void}={}):Promise<SeoGithubExecutionResult>{
  const config=deps.config??resolveSeoGithubConfig(),fetchImpl=deps.fetchImpl??fetch,now=deps.now??new Date();
  if(!["meta_description","content_expansion"].includes(input.actionType))throw new SeoGithubExecutionError("ACTION_NOT_ALLOWLISTED","Approved action type is not executable by the current allowlist");
  const branchName=deps.branchName??seoBranchName(input.actionId,now);assertSafeSeoBranch(branchName);
  const base=await githubRequest<{object:{sha:string}}>(config,`/git/ref/heads/${SEO_GITHUB_BASE_BRANCH}`,{},fetchImpl);
  const current=await (deps.capturePage??captureFirstPartyPage)(input.targetPage);
  if(current.fingerprint!==input.originalContentFingerprint)throw new SeoGithubExecutionError("STALE_FINGERPRINT","The page changed after analysis; refresh the SEO proposal before execution");
  const path=input.actionType==="content_expansion"?SEO_GITHUB_ALLOWED_FILES[1]:SEO_GITHUB_ALLOWED_FILES[0];assertAllowedSeoFile(path);
  const file=await githubRequest<{content:string;encoding:string}>(config,`/contents/${path}?ref=${encodeURIComponent(base.object.sha)}`,{},fetchImpl);
  if(file.encoding!=="base64")throw new SeoGithubExecutionError("UNSUPPORTED_GITHUB_CONTENT","GitHub returned an unsupported source encoding");
  const source=Buffer.from(file.content.replace(/\s/g,""),"base64").toString("utf8"),change=applySeoProposalToSource(path,source,input.targetPage,input.proposal);
  if(input.actionType==="content_expansion"){const registry=JSON.parse(change.content);registry[change.route].actionId=input.actionId;registry[change.route].version=input.actionVersion;change.content=JSON.stringify(registry,null,2)+"\n";}
  await githubRequest(config,"/git/refs",{method:"POST",body:JSON.stringify({ref:`refs/heads/${branchName}`,sha:base.object.sha})},fetchImpl);
  await deps.onProgress?.({branchName,changedFiles:[path]});
  const blob=await githubRequest<{sha:string}>(config,"/git/blobs",{method:"POST",body:JSON.stringify({content:change.content,encoding:"utf-8"})},fetchImpl);
  const parent=await githubRequest<{tree:{sha:string}}>(config,`/git/commits/${base.object.sha}`,{},fetchImpl);
  const tree=await githubRequest<{sha:string}>(config,"/git/trees",{method:"POST",body:JSON.stringify({base_tree:parent.tree.sha,tree:[{path,mode:"100644",type:"blob",sha:blob.sha}]})},fetchImpl);
  const commit=await githubRequest<{sha:string}>(config,"/git/commits",{method:"POST",body:JSON.stringify({message:`SEO: publish approved ${input.actionType} for ${change.route}`,tree:tree.sha,parents:[base.object.sha]})},fetchImpl);
  await githubRequest(config,`/git/refs/heads/${branchName}`,{method:"PATCH",body:JSON.stringify({sha:commit.sha,force:false})},fetchImpl);
  await deps.onProgress?.({branchName,commitSha:commit.sha,changedFiles:[path]});
  const metadata=buildSeoPullRequestMetadata(input,change);
  const pr=await githubRequest<{number:number;html_url:string}>(config,"/pulls",{method:"POST",body:JSON.stringify({...metadata,head:branchName,base:SEO_GITHUB_BASE_BRANCH,draft:false})},fetchImpl);
  await deps.onProgress?.({branchName,commitSha:commit.sha,prNumber:pr.number,prUrl:pr.html_url,changedFiles:[path]});
  return{branchName,commitSha:commit.sha,prNumber:pr.number,prUrl:pr.html_url,changedFiles:[path]};
}
