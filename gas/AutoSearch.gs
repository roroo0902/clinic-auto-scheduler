// Bounded multi-start search. A separate validator is the publication gate.
function autoSearch_(p,options){
 if(p.issues.length)return {status:'NEEDS_INPUT',issues:p.issues,warnings:p.warnings};
 options=options||{};const start=Date.now(),budget=Math.min(20000,Math.max(100,options.budgetMs||15000));
 const domains=Object.fromEntries(p.employees.map(e=>[e.employeeId,Object.fromEntries(p.dates.map(d=>[d,autoOptions_(p,e,d)]))]));
 let evaluated=0,lastErrors=[],best=null;
 const rank=(a,b)=>{for(let i=0;i<a.length;i++)if(a[i]!==b[i])return b[i]-a[i];return 0;};
 for(let attempt=0;attempt<Math.min(30,options.attempts||12)&&Date.now()-start<budget;attempt++){
  let seed=(options.seed||12345)+attempt*997;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const plan=Object.fromEntries(p.employees.map(e=>[e.employeeId,Object.fromEntries(p.dates.map(d=>[d,'']))]));
  const count=(d,s)=>p.employees.filter(e=>plan[e.employeeId][d].includes(s)).length;
  const deficit=d=>[...'ABC'].reduce((n,s)=>n+Math.max(0,p.demands[d+s].requiredHeadcount-count(d,s)),0);
  const qual=d=>[...'ABC'].reduce((n,s)=>n+autoQualifications_(p,plan,d,s).length,0);
  function weeklyMissing(e,key){let hours=0,shifts=0;for(const[d,c]of Object.entries({...p.boundary[e.employeeId],...plan[e.employeeId]}))if(autoWeek_(p,d)===key){shifts+=c.length;hours+=[...c].reduce((n,s)=>n+p.shifts[s].minutes/60,0);}return [Math.max(0,(e.minWeeklyHours||0)-hours),Math.max(0,(e.minWeeklyShifts||0)-shifts)];}
  function trial(e,d,c){
   const changes={[e.employeeId]:c},before={};let changed=true,valid=true;
   // Required-together rules form a closure, including transitive pairs.
   while(changed&&valid){changed=false;for(const r of p.tables.PairingRules||[])if(r.isHard&&r.pairingMode==='REQUIRED_TOGETHER'&&autoActive_(r,d)){
    const a=changes[r.employeeA]??plan[r.employeeA][d],b=changes[r.employeeB]??plan[r.employeeB][d],union=[...'ABC'].filter(s=>a.includes(s)||b.includes(s)).join('');
    for(const id of [r.employeeA,r.employeeB])if((changes[id]??plan[id][d])!==union){if(!domains[id][d].includes(union)){valid=false;break;}changes[id]=union;changed=true;}
   }}
   if(!valid)return null;
   for(const[id,combo]of Object.entries(changes)){before[id]=plan[id][d];if(!domains[id][d].includes(combo)||[...before[id]].some(s=>!combo.includes(s)))valid=false;plan[id][d]=combo;}
   if([... 'ABC'].some(s=>count(d,s)>p.demands[d+s].MaxStaff))valid=false;
   if((p.tables.PairingRules||[]).some(r=>r.isHard&&r.pairingMode==='FORBIDDEN_TOGETHER'&&autoActive_(r,d)&&[...'ABC'].some(s=>plan[r.employeeA][d].includes(s)&&plan[r.employeeB][d].includes(s))))valid=false;
   const stats={};for(const id of Object.keys(changes)){const employee=p.employees.find(x=>x.employeeId===id),r=autoEmployeeIssues_(p,employee,plan[id],false);stats[id]=r;if(r.errors.length)valid=false;}
   const out=valid?{changes,stats,deficit:deficit(d),qual:qual(d),weekly:weeklyMissing(e,autoWeek_(p,d))}:null;
   for(const[id,c]of Object.entries(before))plan[id][d]=c;return out;
  }
  const apply=(d,choice)=>{for(const[id,c]of Object.entries(choice.changes))plan[id][d]=c;};
  let failed=false;
  for(const d of p.dates){
   for(const e of p.employees){const opts=domains[e.employeeId][d];if(!opts.length){failed=true;break;}if(!opts.includes('')){const choices=opts.map(c=>trial(e,d,c)).filter(Boolean);if(!choices.length){failed=true;break;}apply(d,choices[Math.floor(random()*choices.length)]);}}
   for(let step=0;!failed&&step<p.employees.length*3&&(deficit(d)||qual(d));step++){
    const oldD=deficit(d),oldQ=qual(d),candidates=[];
    for(const e of p.employees)for(const c of domains[e.employeeId][d]){if(Date.now()-start>budget)break;const old=plan[e.employeeId][d];if(c===old||[...old].some(s=>!c.includes(s)))continue;const v=trial(e,d,c);if(!v||v.deficit>=oldD&&v.qual>=oldQ)continue;
     const r=v.stats[e.employeeId],beforeHours=autoEmployeeIssues_(p,e,plan[e.employeeId],false).hours;
     v.score=[oldD-v.deficit,oldQ-v.qual,autoBlank_(e.targetMonthlyHours)?0:Math.abs(e.targetMonthlyHours-beforeHours)-Math.abs(e.targetMonthlyHours-r.hours),-r.hours,random()];candidates.push(v);
    }
    if(!candidates.length){failed=true;break;}candidates.sort((a,b)=>rank(a.score,b.score));apply(d,candidates[0]);
   }
   if(failed||Date.now()-start>budget)break;
  }
  // Fill explicit weekly minima without exceeding maximum headcounts or hard limits.
  if(!failed)for(const e of p.employees)for(const key of [...new Set(p.dates.map(d=>autoWeek_(p,d)))]){
   for(let step=0;step<21&&weeklyMissing(e,key).some(n=>n>0);step++){
    const old=weeklyMissing(e,key),candidates=[];
    for(const d of p.dates.filter(d=>autoWeek_(p,d)===key))for(const c of domains[e.employeeId][d]){const v=trial(e,d,c);if(v&&(v.weekly[0]<old[0]||v.weekly[1]<old[1]))candidates.push({...v,d,score:[old[0]-v.weekly[0],old[1]-v.weekly[1],random()]});}
    if(!candidates.length)break;candidates.sort((a,b)=>rank(a.score,b.score));apply(candidates[0].d,candidates[0]);if(Date.now()-start>budget)break;
   }
   if(Date.now()-start>budget)break;
  }
  const validation=autoValidatePlan_(p,plan);evaluated++;lastErrors=validation.errors;
  if(validation.ok){const error=validation.stats.reduce((n,e)=>n+(e.hourDifference===null?0:Math.abs(e.hourDifference)),0);if(!best||error<best.error)best={plan,validation,error};if(attempt>=2)break;}
 }
 if(!best)return {status:'SEARCH_LIMIT',issues:lastErrors.slice(0,100).map(message=>({sheet:'排班結果',message})),warnings:['搜尋時間內尚未找到通過全部硬限制的方案；不代表已證明無解。可調整已確認條件或重新搜尋。'],evaluated,elapsedMs:Date.now()-start};
 return {status:'READY',plan:best.plan,validation:best.validation,warnings:p.warnings.concat('這是通過已輸入硬限制的可行方案，未宣稱全域最佳。目標工時、理想人數與偏好差額請人工覆核；未設定的偏好權重不會自行補值。'),evaluated,elapsedMs:Date.now()-start};
}
