export function seoPullRequestCanMerge(pr:{mergeable?:boolean;mergeable_state?:string},checks:{total_count?:number;check_runs?:Array<{status:string;conclusion:string|null}>},statuses:{statuses?:Array<{state:string}>}){
 return pr.mergeable===true&&pr.mergeable_state==="clean"&&Array.isArray(checks.check_runs)&&Array.isArray(statuses.statuses)&&(checks.total_count??checks.check_runs.length)<=checks.check_runs.length&&checks.check_runs.every(c=>c.status==="completed"&&["success","neutral","skipped"].includes(c.conclusion??""))&&statuses.statuses.every(s=>s.state==="success");
}
