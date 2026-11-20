import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const ctx=vm.createContext({console,Date,Math,Set,Map,JSON,Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(a,v)=>crypto.createHash('sha256').update(v).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url'),newBlob:s=>({getBytes:()=>Buffer.from(s)}),getUuid:()=>crypto.randomUUID()}});
for(const name of ['Model','Data','AutoHeaders','AutoEngine','AutoSearch','AutoFixture','AutoService'])vm.runInContext(fs.readFileSync(new URL('../gas/'+name+'.gs',import.meta.url),'utf8'),ctx);
const copy=v=>JSON.parse(JSON.stringify(v)),fixture=()=>copy(ctx.autoFixture_('2030-11'));
const input=fixture(),p=ctx.autoPrepare_(copy(input)),result=ctx.autoSearch_(p,{budgetMs:10000,attempts:1});
test('17-person nonzero fixture has a fully validated feasible schedule',()=>{assert.equal(result.status,'READY');assert.equal(result.validation.stats.length,17);assert(result.validation.stats.every(e=>e.shifts>0));assert.equal(ctx.autoValidatePlan_(p,result.plan).ok,true);});
test('blank demand is unknown and never zero; explicit zero remains valid',()=>{const f=fixture();delete f.tables.DailyShiftDemands[0].requiredHeadcount;let q=ctx.autoPrepare_(f);assert(q.issues.some(x=>x.message.includes('空白不是零')));assert.equal(ctx.autoSearch_(q).status,'NEEDS_INPUT');assert.equal(f.tables.DailyShiftDemands[0].requiredHeadcount,undefined);});
test('calendar and unpaid break missing fail closed',()=>{const f=fixture();f.tables.CalendarDates[0].isOperatingDay='';f.tables.ShiftDefinitions[0].unpaidBreakMinutes='';const q=ctx.autoPrepare_(f);assert(q.issues.some(x=>x.sheet==='CalendarDates'));assert(q.issues.some(x=>x.sheet==='ShiftDefinitions'));});
test('cross-month unknown is not rest',()=>{const f=fixture();f.tables.CrossMonthCoverage.pop();assert(ctx.autoPrepare_(f).issues.some(x=>x.sheet==='CrossMonthCoverage'));});
test('validation independently rejects excess headcount and invalid employee set',()=>{const plan=copy(result.plan);for(const e of input.tables.Employees)plan[e.employeeId]['2030-11-01']='A';assert.equal(ctx.autoValidatePlan_(p,plan).ok,false);delete plan.TEST17;assert.equal(ctx.autoValidatePlan_(p,plan).ok,false);});
test('approved leave, forced shifts, allowed combinations and locks are enforced',()=>{const f=fixture();f.tables.LeaveRequests=[{employeeId:'TEST01',startDate:'2030-11-01',endDate:'2030-11-01',status:'APPROVED',requestedShifts:'A'}];const q=ctx.autoPrepare_(f);assert.equal(ctx.autoValidatePlan_(q,result.plan).ok,false);f.tables.AssignmentLocks=[{employeeId:'TEST01',date:'2030-11-01',shiftId:'A',locked:true}];assert(ctx.autoPrepare_(f).issues.some(x=>x.sheet==='AssignmentLocks'));});
test('weekly minima and day limits are independently enforced',()=>{const f=fixture();f.tables.Employees[0].minWeeklyHours=40;assert(ctx.autoValidatePlan_(ctx.autoPrepare_(f),result.plan).errors.some(x=>x.includes('最低工時')));f.tables.Employees[0].maxDailyHours=0;assert(ctx.autoValidatePlan_(ctx.autoPrepare_(f),result.plan).errors.some(x=>x.includes('每日工時')));});
test('hard pair rules and distinct qualification slots are enforced',()=>{const f=fixture(),d='2030-11-01';f.tables.PairingRules=[{employeeA:'TEST01',employeeB:'TEST02',pairingMode:'REQUIRED_TOGETHER',isHard:true}];const plan=copy(result.plan);plan.TEST01[d]='A';plan.TEST02[d]='';assert(ctx.autoValidatePlan_(ctx.autoPrepare_(f),plan).errors.some(x=>x.includes('搭班')));f.tables.PairingRules=[];f.tables.ShiftQualificationDemands=[{date:d,shiftId:'A',qualificationId:'Q',minimumQualifiedCount:2,distinctPersonRequirement:true}];f.tables.EmployeeQualifications=[{employeeId:'TEST01',qualificationId:'Q',verifiedForLegalDuty:true}];assert(ctx.autoValidatePlan_(ctx.autoPrepare_(f),plan).errors.some(x=>x.includes('資格')));});
test('unrecognized legal policy cannot be silently ignored',()=>{const f=fixture();f.tables.LegalPolicy=[{policyJson:'{"unknownRule":true}',effectiveFrom:'2030-01-01',approvedBy:'TEST',verificationSourceRef:'fixture'}];assert(ctx.autoPrepare_(f).issues.some(x=>x.sheet==='LegalPolicy'));});

// Service-level acceptance uses a bounded in-memory Sheets implementation.
let store={},cache=new Map(),writes=0,role='管理者',forceMismatch=false;
ctx.requireMember_=()=>({role,email:'acceptance@example.invalid'});ctx.readSheets_=fn=>fn();
ctx.CacheService={getUserCache:()=>({put:(k,v)=>cache.set(k,v),get:k=>cache.get(k),remove:k=>cache.delete(k)})};
ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};
ctx.ACCESS_SHEET_ID='fixture-sheet';
function values(range){const m=/^'([^']+)'!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);assert(m,range);const ix=s=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1;const rows=store[m[1]]?.rows||[];return {values:copy(rows.slice(+m[3]-1,+m[5]).map(r=>r.slice(ix(m[2]),ix(m[4])+1)))};}
ctx.Sheets={Spreadsheets:{get:()=>({sheets:Object.entries(store).map(([title,s])=>({properties:{title,sheetId:s.id,gridProperties:{rowCount:1000,columnCount:36}}}))}),Values:{batchGet:(id,{ranges})=>({valueRanges:ranges.map(r=>{const v=values(r);if(forceMismatch&&ranges.length===17&&v.values.length)v.values[0][0]='CORRUPTED';return v;})}),get:(id,r)=>values(r)},batchUpdate:({requests})=>{writes++;for(const r of requests){if(r.addSheet)store[r.addSheet.properties.title]={id:r.addSheet.properties.sheetId,rows:[]};if(r.duplicateSheet){const source=Object.values(store).find(s=>s.id===r.duplicateSheet.sourceSheetId);store[r.duplicateSheet.newSheetName]={id:r.duplicateSheet.newSheetId,rows:copy(source.rows)};}if(r.updateCells){const s=Object.values(store).find(s=>s.id===r.updateCells.start.sheetId);assert(s);r.updateCells.rows.forEach((row,i)=>{const ix=r.updateCells.start.rowIndex+i;s.rows[ix]??=[];row.values.forEach((c,j)=>s.rows[ix][r.updateCells.start.columnIndex+j]=Object.values(c.userEnteredValue)[0]);});}}}}};
function savedDraft(){const token=crypto.randomUUID(),snap=ctx.autoSnapshot_('2030-11','acceptance');cache.set('auto:'+token,JSON.stringify({month:'2030-11',mode:'acceptance',plan:result.plan,fingerprint:snap.fingerprint,engine:'1.0.0'}));return token;}
test('atomic publication stores all 17 rows and verifies values',()=>{const token=savedDraft(),r=ctx.publishAutoSchedule({token,confirmed:true});assert.equal(r.status,'VERIFIED');assert.equal(r.employeeCount,17);assert.equal(writes,1);assert.equal(store['自動排班驗收'].rows.length,18);assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/到期或已送出/);assert.equal(writes,1);});
test('stale preview refuses writes and normal user has no access',()=>{const token=savedDraft();store['自動排班驗收'].rows[1][35]='changed';assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/Sheet 已變更/);assert.equal(writes,1);role='一般使用者';assert.throws(()=>ctx.previewAutoSchedule({month:'2030-11',mode:'acceptance',checkOnly:true}),/管理者/);role='管理者';});
test('readback mismatch never reports success or retries write',()=>{const token=savedDraft();forceMismatch=true;assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/核對未完成/);assert.equal(writes,2);assert(!cache.has('auto:'+token));forceMismatch=false;});
test('monthly formula protection blocks replacement',()=>{const token=savedDraft(),original=ctx.Sheets.Spreadsheets.Values.get;ctx.Sheets.Spreadsheets.Values.get=()=>({values:[[],['=FORMULA()']]});assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/包含公式/);assert.equal(writes,2);ctx.Sheets.Spreadsheets.Values.get=original;});
const demandReviewHeader=()=>['日期','星期','班別與時間','最低人數','最高人數','理想人數','此班休診','補充說明','核對狀態','原需求代碼'];
test('production commit synchronizes month, assignments, version, audit and approved demand overlay',()=>{
 store={};writes=0;const contract=vm.runInContext('({fields:AUTO_FIELDS_,input:AUTO_INPUTS_,output:AUTO_OUTPUTS_,aliases:CHINESE_SHEET_TITLES_,custom:CHINESE_FORM_COLUMNS_,header:AUTO_MONTH_HEADER_})',ctx);let id=100;
 const f=fixture();f.tables.DailyShiftDemands.forEach((r,i)=>r.demandId='D'+i);f.tables.ForcedShifts.forEach((r,i)=>r.forcedShiftId='F'+i);
 for(const n of [...contract.input,...contract.output]){const fields=contract.custom[n]?contract.custom[n].split(','):contract.fields[n];store[contract.aliases[n]||n]={id:id++,rows:[copy(fields),...(f.tables[n]||[]).map(r=>fields.map(k=>r[k]??''))]};}
 store['排班控制']={id:id++,rows:[['key','name','value'],['WEEK_START_DAY','起始',1],['ACTIVE_SCHEDULE_VERSION','目前','']]};store['系統參數']={id:id++,rows:[['key','value']]};store['月班表']={id:id++,rows:[copy(contract.header)]};
 store['人力需求待填_2030-11']={id:id++,rows:[[],[],[],demandReviewHeader(),['2030-11-01','','A 08:00–12:00',2,4,2,false,'','待確認','D0']]};
 const snap=ctx.autoSnapshot_('2030-11','production');assert.equal(snap.demandUpdates.length,0);const review=ctx.getAutoDemandReview({month:'2030-11'});assert.equal(review.rows.length,1);const demandDecision=ctx.autoDemandDecision_(snap,'2030-11',ctx.requireMember_(),{token:review.token,fingerprint:review.fingerprint,action:'apply',selectedIds:['r5']});const prepared=ctx.autoPrepare_(snap.input);assert.equal(prepared.issues.length,0,JSON.stringify(prepared.issues));const token=crypto.randomUUID(),draft={month:'2030-11',mode:'production',plan:result.plan,fingerprint:snap.fingerprint,engine:'1.0.0',demandReviewVersion:1,demandDecision};
 cache.set('auto:'+token,JSON.stringify({...draft,demandReviewedBy:'another-admin@example.invalid'}));assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/操作者不同/);assert.equal(writes,0);
 cache.set('auto:'+token,JSON.stringify({...draft,demandReviewedBy:ctx.requireMember_().email}));
 const r=ctx.publishAutoSchedule({token,confirmed:true});assert.equal(r.status,'VERIFIED');assert.equal(writes,1);assert.equal(store['月班表'].rows.length,18);assert.equal(store['班表版本紀錄'].rows.length,2);assert(store['班表排班明細'].rows.length>180);assert.equal(store['操作稽核紀錄'].rows.length,2);assert.equal(store['每日班別人力需求'].rows[1][4],4);assert.equal(store['排班控制'].rows[2][2],r.version);
});


// Additional offline acceptance, 2026-11-20. No network or real Sheets.
function resetAcceptance(){store={};cache.clear();writes=0;role='管理者';forceMismatch=false;}
test('QA: missing confirmation and malformed token never write',()=>{resetAcceptance();const token=savedDraft();for(const input of [{token},{token,confirmed:false},{token:'bad',confirmed:true}])assert.throws(()=>ctx.publishAutoSchedule(input),/預覽並確認/);assert.equal(writes,0);assert(cache.has('auto:'+token));});
test('QA: expired draft never writes',()=>{resetAcceptance();assert.throws(()=>ctx.publishAutoSchedule({token:crypto.randomUUID(),confirmed:true}),/到期或已送出/);assert.equal(writes,0);});
test('QA: downgraded administrator cannot publish existing preview',()=>{resetAcceptance();const token=savedDraft();role='一般使用者';try{assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/管理者/);assert.equal(writes,0);}finally{role='管理者';}});
test('QA: lock contention prevents reads and writes without consuming preview',()=>{resetAcceptance();const token=savedDraft(),original=ctx.LockService;ctx.LockService={getScriptLock:()=>({tryLock:()=>false,releaseLock:()=>assert.fail('unowned lock released')})};try{assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/有人正在儲存/);assert.equal(writes,0);assert(cache.has('auto:'+token));}finally{ctx.LockService=original;}});
test('QA: engine-version mismatch is rejected before writes',()=>{resetAcceptance();const token=savedDraft(),draft=JSON.parse(cache.get('auto:'+token));draft.engine='obsolete';cache.set('auto:'+token,JSON.stringify(draft));assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/舊預覽/);assert.equal(writes,0);});
test('QA: tampered infeasible plan rejected independently at publish',()=>{resetAcceptance();const token=savedDraft(),draft=JSON.parse(cache.get('auto:'+token));draft.plan.TEST01['2030-11-01']='INVALID';cache.set('auto:'+token,JSON.stringify(draft));assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/驗證未通過/);assert.equal(writes,0);});
test('QA: uncertain batch failure consumes token and releases lock',()=>{resetAcceptance();const token=savedDraft(),original=ctx.Sheets.Spreadsheets.batchUpdate,locks=ctx.LockService;let calls=0,releases=0;ctx.Sheets.Spreadsheets.batchUpdate=()=>{calls++;throw Error('simulated network ambiguity');};ctx.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>releases++})};try{assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/network ambiguity/);assert(!cache.has('auto:'+token));assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/到期或已送出/);assert.equal(calls,1);assert.equal(releases,2);}finally{ctx.Sheets.Spreadsheets.batchUpdate=original;ctx.LockService=locks;}});
test('QA: incomplete publication readback cannot claim VERIFIED',()=>{resetAcceptance();const token=savedDraft(),original=ctx.Sheets.Spreadsheets.Values.batchGet;ctx.Sheets.Spreadsheets.Values.batchGet=(id,opts)=>opts.ranges.length===17?{valueRanges:[]}:original(id,opts);try{assert.throws(()=>ctx.publishAutoSchedule({token,confirmed:true}),/核對未完成/);assert.equal(writes,1);assert(!cache.has('auto:'+token));}finally{ctx.Sheets.Spreadsheets.Values.batchGet=original;}});
test('QA: acceptance check-only never writes or caches publication token',()=>{resetAcceptance();const r=ctx.previewAutoSchedule({month:'2030-11',mode:'acceptance',checkOnly:true});assert.equal(r.status,'CHECKED');assert.equal(r.employeeCount,17);assert.equal(r.token,undefined);assert.equal(writes,0);assert.equal(cache.size,0);});
test('QA: unsupported modes and invalid months fail closed',()=>{resetAcceptance();for(const month of ['2030-00','2030-13','2030-1','',"2030-11'!A1"] )assert.throws(()=>ctx.previewAutoSchedule({month,mode:'acceptance',checkOnly:true}),/月份或模式/);assert.throws(()=>ctx.previewAutoSchedule({month:'2030-11',mode:'other',checkOnly:true}),/月份或模式/);assert.equal(writes,0);});
test('QA: leap February and year-boundary fixtures prepare with exact day counts',()=>{for(const [month,days] of [['2032-02',29],['2031-02',28],['2030-12',31],['2031-01',31]]){const q=ctx.autoPrepare_(copy(ctx.autoFixture_(month)));assert.equal(q.issues.length,0,JSON.stringify(q.issues));assert.equal(q.dates.length,days);}});
test('QA: acceptance snapshot never reads or merges production people',()=>{resetAcceptance();store['員工資料']={id:1,rows:[['employeeId'],['REAL-PERSON-DO-NOT-USE']]};const s=ctx.autoSnapshot_('2030-11','acceptance');assert.equal(s.input.tables.Employees.length,17);assert(s.input.tables.Employees.every(e=>e.employeeId.startsWith('TEST')));assert.equal(s.raw['員工資料'],undefined);assert.equal(writes,0);});
test('QA: demand link resolver returns exact existing month without writes',()=>{resetAcceptance();store['人力需求待填_2026-11']={id:11,rows:[]};store['人力需求待填_2026-12']={id:12,rows:[]};assert.match(ctx.getAutoDemandSheetLink({month:'2026-12'}).url,/#gid=12$/);assert.equal(ctx.getAutoDemandSheetLink({month:'2027-01'}).url,null);assert.equal(writes,0);});
test('QA: demand link resolver rejects invalid months and unauthorized callers',()=>{resetAcceptance();assert.throws(()=>ctx.getAutoDemandSheetLink({month:'2026-13'}),/月份/);role='一般使用者';try{assert.throws(()=>ctx.getAutoDemandSheetLink({month:'2026-11'}),/管理者/);}finally{role='管理者';}assert.equal(writes,0);});

test('demand overlay: 11/28 tentative reopening never replaces the official closure without explicit review',()=>{
 const date='2026-11-28',month='2026-11',official=[{demandId:'DEM-'+date+'-A',date,shiftId:'A',requiredHeadcount:0,MaxStaff:0,idealHeadcount:0,isClosed:true,_row:27}];
 const fill=[[],[],[],demandReviewHeader(),[date,'六','A 08:00–12:00',2,7,7,false,'','待確認','DEM-'+date+'-A']];
 const candidates=ctx.autoDemandCandidates_(month,fill,official);
 assert.equal(candidates[0].eligible,true);assert.equal(candidates[0].official.closed,true);assert.equal(candidates[0].proposed.closed,false);
 const snap={demandCandidates:candidates,demandUpdates:[],input:{issues:[]}};
 assert.equal(ctx.autoDemandDecision_(snap,month,ctx.requireMember_(),null),null);
 assert.equal(snap.input.issues.length,1);assert.equal(snap.demandUpdates.length,0);assert.equal(official[0].isClosed,true);
 ctx.autoApplyDemandDecision_(snap,{action:'baseline',selectedIds:[],expiresAt:Date.now()+60000});
 assert.equal(snap.demandUpdates.length,0);assert.equal(official[0].isClosed,true);
 ctx.autoApplyDemandDecision_(snap,{action:'apply',selectedIds:['r5'],expiresAt:Date.now()+60000});
 assert.equal(snap.demandUpdates.length,4);assert.equal(official[0].isClosed,false);assert.equal(official[0].MaxStaff,7);
});

test('demand overlay: mismatched shift, duplicate IDs and invalid counts are ineligible; baseline still available',()=>{
 const date='2026-11-28',month='2026-11',target={demandId:'AA',date,shiftId:'A',requiredHeadcount:2,MaxStaff:6,idealHeadcount:3,isClosed:false,_row:2};
 const fill=(...rows)=>[[],[],[],demandReviewHeader(),...rows];
 const row=[date,'','A 08:00–12:00',2,7,3,false,'','待確認','AA'];
 for(const f of [fill([...row.slice(0,2),'B 14:30–18:30',...row.slice(3)]),fill(row,row),fill([date,'','A',2,7,3,true,'','','AA']),fill([date,'','A',2,7,8,false,'','','AA']),fill([date,'','A','','',5,false,'','','AA'])]){
  const snap={demandCandidates:ctx.autoDemandCandidates_(month,f,[target]),demandUpdates:[]};
  assert(snap.demandCandidates.length>0);assert(snap.demandCandidates.every(x=>!x.eligible));
  assert.throws(()=>ctx.autoApplyDemandDecision_(snap,{action:'apply',selectedIds:['r5'],expiresAt:Date.now()+60000}),/不能採用/);
  ctx.autoApplyDemandDecision_(snap,{action:'baseline',selectedIds:[],expiresAt:Date.now()+60000});
  assert.equal(snap.demandUpdates.length,0);assert.equal(target.MaxStaff,6);
 }
});

test('demand overlay: independent role, month, fingerprint, expiration and row list gates',()=>{
 const month='2026-11',token=crypto.randomUUID(),fingerprint='fixture-digest',actor=ctx.requireMember_(),review={action:'baseline',selectedIds:[],token,fingerprint};
 const snap={fingerprint,demandCandidates:[],demandUpdates:[]};
 cache.set('auto-demand:'+token,JSON.stringify({month,fingerprint,actor:actor.email,expiresAt:Date.now()+60000}));
 assert.equal(ctx.autoDemandDecision_(snap,month,actor,review).action,'baseline');
 assert.throws(()=>ctx.autoDemandDecision_(snap,'2026-12',actor,review),/到期或資料已變更/);
 assert.throws(()=>ctx.autoDemandDecision_({...snap,fingerprint:'changed'},month,actor,review),/到期或資料已變更/);
 assert.throws(()=>ctx.autoDemandDecision_(snap,month,{email:'another@example.invalid'},review),/到期或資料已變更/);
 assert.throws(()=>ctx.autoDemandDecision_(snap,month,actor,{...review,selectedIds:['r5']}),/明確選擇/);
 cache.set('auto-demand:'+token,JSON.stringify({month,fingerprint,actor:actor.email,expiresAt:Date.now()-1}));
 assert.throws(()=>ctx.autoDemandDecision_(snap,month,actor,review),/到期或資料已變更/);
 const oldRole=role;role='一般使用者';try{assert.throws(()=>ctx.getAutoDemandReview({month}),/管理者/);}finally{role=oldRole;}
});
