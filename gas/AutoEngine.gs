// Pure scheduling/validation code. No Google calls and no private data.
const AUTO_ENGINE_VERSION_='1.0.0';
const autoBlank_=v=>v===undefined||v===null||v==='';
const autoDate_=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const autoDay_=d=>Math.floor(Date.parse(d+'T00:00:00Z')/86400000);
const autoIso_=d=>new Date(d*86400000).toISOString().slice(0,10);
const autoActive_=(r,date)=> (autoBlank_(r.validFrom||r.effectiveFrom)||(r.validFrom||r.effectiveFrom)<=date)&&(autoBlank_(r.validTo||r.effectiveTo)||(r.validTo||r.effectiveTo)>=date);
const autoCombo_=s=>typeof s==='string'&&['','A','B','C','AB','AC','BC','ABC'].includes(s);
function autoPrepare_(input){
 const issues=(input.issues||[]).slice(),warnings=[],t=input.tables||{},month=input.month;
 const add=(sheet,message,row)=>issues.push({sheet,row:row||'',message});
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return {issues:[{sheet:'月份',message:'請選擇正確月份。'}],warnings};
 const count=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate(),dates=Array.from({length:count},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const employees=(t.Employees||[]).filter(e=>e.active===true),ids=new Set();
 if(!employees.length)add('Employees','沒有已啟用的員工。');
 if(employees.length>60)add('Employees','本版一次支援最多 60 人。');
 const required=['maxDailyHours','maxWeeklyHours','maxConsecutiveDays','maxWeeklyWorkDays','minRestHours'];
 const nums=[...required,'minMonthlyRestDays','maxMonthlyWorkDays','maxMonthlyHours','maxDailyShifts','minWeeklyHours','minWeeklyShifts','maxWeeklyShifts','targetMonthlyHours','targetMonthlyWorkDays','preferredMinDailyHours'];
 for(const e of t.Employees||[]){
  if(!e.employeeId||!e.displayName||ids.has(e.employeeId)||typeof e.active!=='boolean')add('Employees','員工代碼／姓名／啟用狀態缺漏或重複。',e._row);ids.add(e.employeeId);
  for(const k of ['validFrom','validTo'])if(!autoBlank_(e[k])&&!autoDate_(e[k]))add('Employees',e.employeeId+' 生效日期格式錯誤。',e._row);
  if(e.active!==true)continue;
  for(const k of nums)if(required.includes(k)&&autoBlank_(e[k])||!autoBlank_(e[k])&&(typeof e[k]!=='number'||!Number.isFinite(e[k])||e[k]<0||(/Days$|Shifts$/.test(k)&&!Number.isInteger(e[k]))))add('Employees',e.employeeId+' '+(typeof labels!=='undefined'?labels[k]||k:k)+' 待填或格式錯誤。',e._row);
  if(e.maxConsecutiveDays>31||e.maxWeeklyWorkDays>7)add('Employees',e.employeeId+' 連續／每週工作天數超出支援範圍。',e._row);
 }
 const shifts={};
 for(const s of t.ShiftDefinitions||[]){
  if(!dates.some(d=>autoActive_(s,d)))continue;
  if(!['A','B','C'].includes(s.shiftId)||shifts[s.shiftId]){add('ShiftDefinitions','班別不支援或有重疊生效版本。',s._row);continue;}
  const parse=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v)?(+v.slice(0,2)*60 + +v.slice(3)):NaN;
  const start=parse(s.startTime),end=parse(s.endTime)+s.endDayOffset*1440;
  if(!Number.isFinite(start)||!Number.isFinite(end)||!Number.isInteger(s.endDayOffset)||s.endDayOffset<0||s.endDayOffset>1||end<=start||typeof s.unpaidBreakMinutes!=='number'||s.unpaidBreakMinutes<0||s.unpaidBreakMinutes>=end-start||!Number.isFinite(s.unpaidBreakMinutes))add('ShiftDefinitions',s.shiftId+' 時間或不計工時休息分鐘待確認。',s._row);
  if(!autoBlank_(s.breakRules))add('ShiftDefinitions',s.shiftId+' 有自訂休息規則，須先轉成明確的休息分鐘；本版不解讀文字規則。',s._row);
  if(!autoBlank_(s.hoursCalculationPolicy)&&!['ELAPSED_MINUS_UNPAID_BREAK','DURATION_MINUS_BREAK'].includes(s.hoursCalculationPolicy))add('ShiftDefinitions',s.shiftId+' 工時計算方式尚不支援。',s._row);
  if(dates.some(d=>!autoActive_(s,d)))add('ShiftDefinitions',s.shiftId+' 生效期間未涵蓋整月。',s._row);
  const minutes=end-start-s.unpaidBreakMinutes;
  if(Number.isFinite(minutes)&&minutes!==({A:240,B:240,C:180}[s.shiftId]))add('ShiftDefinitions',s.shiftId+' 與目前月班表工時計算不同，不能發布。',s._row);
  shifts[s.shiftId]={...s,start,end,minutes};
 }
 for(const c of 'ABC')if(!shifts[c])add('ShiftDefinitions','缺少班別 '+c+'。');
 const calendar={},demands={};
 for(const d of dates){
  const cal=(t.CalendarDates||[]).filter(r=>r.date===d);
  if(cal.length!==1||typeof cal[0].isOperatingDay!=='boolean')add('CalendarDates',d+' 營業日待確認或日期重複。',cal[0]?._row);
  calendar[d]=cal[0]||{};
  for(const c of 'ABC'){
   const rows=(t.DailyShiftDemands||[]).filter(r=>r.date===d&&r.shiftId===c),r=rows[0]||{};demands[d+c]=r;
   if(rows.length!==1)add('DailyShiftDemands',d+' '+c+' 缺少人力需求列或重複。',r._row);
   const missing=['requiredHeadcount','MaxStaff'].filter(k=>autoBlank_(r[k]));
   if(missing.length)add('DailyShiftDemands',d+' '+c+' '+missing.map(k=>k==='requiredHeadcount'?'最低人數':'最高人數').join('／')+'待填；空白不是零。',r._row);
   for(const k of ['requiredHeadcount','MaxStaff','idealHeadcount'])if(!autoBlank_(r[k])&&(!Number.isInteger(r[k])||r[k]<0))add('DailyShiftDemands',d+' '+c+' 人數必須是非負整數。',r._row);
   if(typeof r.isClosed!=='boolean')add('DailyShiftDemands',d+' '+c+' 休診狀態待確認。',r._row);
   if(!missing.length&&(r.requiredHeadcount>r.MaxStaff||!autoBlank_(r.idealHeadcount)&&(r.idealHeadcount<r.requiredHeadcount||r.idealHeadcount>r.MaxStaff)))add('DailyShiftDemands',d+' '+c+' 最低、理想、最高人數矛盾。',r._row);
   if((r.isClosed===true||calendar[d].isOperatingDay===false)&&[r.requiredHeadcount,r.MaxStaff,r.idealHeadcount].some(v=>!autoBlank_(v)&&v!==0))add('DailyShiftDemands',d+' '+c+' 休診班次須明確填 0。',r._row);
  }
 }
 const weekStart=Number(input.weekStart);if(!Number.isInteger(weekStart)||weekStart<1||weekStart>7)add('排班控制','每週起始日待確認。');
 const personIds=new Set(employees.map(e=>e.employeeId));
 const dateTables=['EmployeeAvailability','ForcedShifts','AssignmentLocks','個人假日設定','ShiftQualificationDemands'];
 const ruleTables=[...dateTables,'RecurringAvailability','LeaveRequests','EmployeeQualifications','EmployeePreferences','AllowedShifts','組合優先設定','班別優先人員','PairingRules','ShiftTransitions'];
 for(const name of ruleTables)for(const r of t[name]||[]){
  if(r.employeeId&&!personIds.has(r.employeeId)&&r.employeeId!=='ALL')add(name,'規則引用未啟用或不存在的員工 '+r.employeeId+'。',r._row);
  if(r.shiftId&&!['A','B','C'].includes(r.shiftId))add(name,'班別代碼不正確。',r._row);
  for(const k of ['date','validFrom','validTo','effectiveFrom','effectiveTo','startDate','endDate'])if(!autoBlank_(r[k])&&!autoDate_(r[k]))add(name,k+' 日期格式不正確。',r._row);
  if(dateTables.includes(name)&&!autoDate_(r.date))add(name,'日期待填。',r._row);
 }
 for(const r of t.AllowedShifts||[])if(!autoCombo_(r.combination)||!r.combination||typeof r.allowed!=='boolean')add('AllowedShifts','班別組合或允許狀態不正確。',r._row);
 for(const name of ['EmployeeAvailability','RecurringAvailability'])for(const r of t[name]||[]){
  if(!['AVAILABLE','UNAVAILABLE','PREFER_OFF','REQUIRE_SHIFT','WORK','OFF'].includes(r.conditionType)||typeof r.isHard!=='boolean')add(name,'可排班條件或強度不明。',r._row);
  if(name==='RecurringAvailability'&&(!Number.isInteger(Number(r.weekday))||+r.weekday<1||+r.weekday>7))add(name,'星期需為 1 至 7。',r._row);
 }
 for(const r of t.LeaveRequests||[])if(!['APPROVED','PENDING','REJECTED','CANCELLED','已核准','待審核','駁回','已取消'].includes(r.status)||!autoDate_(r.startDate)||!autoDate_(r.endDate)||r.startDate>r.endDate||!autoCombo_(String(r.requestedShifts||'ABC')))add('LeaveRequests','請假日期、狀態或班別不明。',r._row);
 for(const r of t['個人假日設定']||[])if(!['禁止排班','需人工確認'].includes(r.schedulePolicy))add('個人假日設定','排班政策尚未確認。',r._row);
 for(const r of t.PairingRules||[])if(!personIds.has(r.employeeA)||!personIds.has(r.employeeB)||r.employeeA===r.employeeB||!['REQUIRED_TOGETHER','PREFERRED_TOGETHER','FORBIDDEN_TOGETHER','PREFERRED_APART'].includes(r.pairingMode)||typeof r.isHard!=='boolean')add('PairingRules','搭班規則不完整。',r._row);
 for(const r of t.ShiftTransitions||[])if(!['FORBID','AVOID','ALLOW'].includes(r.ruleMode)||!['A','B','C'].includes(r.fromShiftId)||!['A','B','C'].includes(r.toShiftId))add('ShiftTransitions','銜接規則不完整。',r._row);
 for(const r of t.ShiftQualificationDemands||[])if(!r.qualificationId||!Number.isInteger(r.minimumQualifiedCount)||r.minimumQualifiedCount<0||r.minimumQualifiedCount>60||typeof r.distinctPersonRequirement!=='boolean')add('ShiftQualificationDemands','資格人數或不同人員要求待確認。',r._row);
 for(const r of t['組合優先設定']||[])if(!['PREFER','REQUIRE'].includes(r.mode)||!autoCombo_(r.combination)||!r.combination||(!autoBlank_(r.maxPerWeek)&&(!Number.isInteger(r.maxPerWeek)||r.maxPerWeek<0)))add('組合優先設定','組合規則不完整。',r._row);
 for(const r of t['班別優先人員']||[])if(typeof r.allowOutsideList!=='boolean'||!autoBlank_(r.weekday)&&(!Number.isInteger(+r.weekday)||+r.weekday<1||+r.weekday>7))add('班別優先人員','優先人員名單不完整。',r._row);
 // Explicit policy JSON may add numeric caps. Unknown policy keys never silently disappear.
 const policyKeys=['maxDailyHours','maxWeeklyHours','maxConsecutiveDays','maxWeeklyWorkDays','minRestHours','maxMonthlyHours','maxDailyShifts'];
 for(const r of t.LegalPolicy||[]){
  if(!r.approvedBy||!r.verificationSourceRef||!autoDate_(r.effectiveFrom))add('LegalPolicy','政策核准、依據或生效日期待確認。',r._row);
  try{r.parsed=JSON.parse(r.policyJson);if(!r.parsed||Array.isArray(r.parsed)||Object.keys(r.parsed).some(k=>!policyKeys.includes(k)||typeof r.parsed[k]!=='number'||!Number.isFinite(r.parsed[k])||r.parsed[k]<0))throw Error();}catch{add('LegalPolicy','政策內容必須是支援上限／休息時數的 JSON，未知政策禁止發布。',r._row);}
  if(!autoBlank_(r.weeklyStartDay)&&+r.weeklyStartDay!==weekStart)add('LegalPolicy','政策週起始日與排班控制不同。',r._row);
  if(!autoBlank_(r.minRestMinutes)&&(typeof r.minRestMinutes!=='number'||r.minRestMinutes<0))add('LegalPolicy','最少休息分鐘格式不正確。',r._row);
 }
 for(const r of t.AssignmentLocks||[])if(typeof r.locked!=='boolean'||r.locked===true&&!Object.prototype.hasOwnProperty.call(input.existing?.[r.employeeId]||{},r.date))add('AssignmentLocks','鎖定狀態或原班表資料不完整。',r._row);
 for(const r of t.EmployeePreferences||[])if(!['PREFER','AVOID'].includes(r.preferenceType))add('EmployeePreferences','偏好類型無法辨識。',r._row);
 for(const name of ['EmployeeAvailability','RecurringAvailability'])for(const r of t[name]||[])if(['REQUIRE_SHIFT','WORK'].includes(r.conditionType)&&!r.shiftId)add(name,'指定上班條件必須填班別。',r._row);
 if((t.EmployeeSettingsHistory||[]).some(r=>dates.some(d=>autoActive_(r,d))))add('EmployeeSettingsHistory','本月有歷史設定版本，請先將已核准且適用本月的限制整理到員工基本資料；目前停止發布，避免忽略版本。');
 const boundary={};
 for(const r of t['個人假日設定']||[])if(r.schedulePolicy==='需人工確認'&&r.date.startsWith(month))add('個人假日設定',r.date+' 個人假日仍需人工確認，請先確定禁止排班或調整資料。',r._row);
 for(const r of t.PairingRules||[])if(r.isHard&&!['REQUIRED_TOGETHER','FORBIDDEN_TOGETHER'].includes(r.pairingMode))add('PairingRules','硬性搭班規則必須選擇必須同班或禁止同班。',r._row);
 for(const e of employees)for(const d of dates)for(const c of ['A','B','C','AB','AC','BC','ABC']){const rules=(t.AllowedShifts||[]).filter(r=>r.combination===c&&autoMatches_(r,e,d)),exact=rules.filter(r=>r.employeeId===e.employeeId);if((exact.length?exact:rules).length>1){add('AllowedShifts',e.employeeId+' '+d+' '+c+' 允許班別規則重複。');break;}}
 for(const e of employees){
  const horizon=Math.max(7,Math.ceil(e.maxConsecutiveDays||0),Math.ceil((e.minRestHours||0)/24)+1),missing=[];boundary[e.employeeId]={};
  if(horizon>32){add('Employees',e.employeeId+' 跨月驗證跨度超過 32 天。',e._row);continue;}
  for(let x=autoDay_(dates[0])-horizon;x<=autoDay_(dates[dates.length-1])+horizon;x++){
   const d=autoIso_(x);if(d.startsWith(month))continue;
   const rows=(t.CrossMonthCoverage||[]).filter(r=>r.employeeId===e.employeeId&&r.date===d),r=rows[0];
   if(rows.length!==1||!['WORK','REST'].includes(r.coverageStatus)||!r.sourceScheduleVersionId||!r.verifiedBy){missing.push(d);continue;}
   const combo=(input.existing||{})[e.employeeId]?.[d];
   if(r.coverageStatus==='WORK'&&(!combo||!autoCombo_(combo))||r.coverageStatus==='REST'&&combo){missing.push(d);continue;}
   boundary[e.employeeId][d]=r.coverageStatus==='REST'?'':combo;
  }
  if(missing.length)add('CrossMonthCoverage',e.employeeId+' 缺 '+missing.length+' 天已核實跨月資料（'+missing[0]+' 等）；不可假定休假。');
 }
 const prepared={...input,tables:t,month,dates,employees,shifts,calendar,demands,weekStart,boundary,issues,warnings};
 if(!(t.LegalPolicy||[]).length)warnings.push('未設定已核准法規政策；本次僅驗證已輸入的排班條件，不代表法規合規認證。');
 for(const e of employees)for(const d of dates){const options=autoOptions_(prepared,e,d);if(options.length===1&&options[0]===''&&Object.values(demands).some(r=>r.date===d&&r.requiredHeadcount>0)){warnings.push(e.employeeId+' '+d+' 沒有允許的班別組合。');break;}}
 return prepared;
}
function autoWeek_(p,d){const day=autoDay_(d),weekday=(new Date(day*86400000).getUTCDay()||7);return autoIso_(day-(weekday-p.weekStart+7)%7);}
function autoMatches_(r,e,d){return (r.employeeId===e.employeeId||r.employeeId==='ALL')&&autoActive_(r,d)&&(!r.date||r.date===d)&&(!r.weekday||+r.weekday===(new Date(d+'T00:00:00Z').getUTCDay()||7));}
function autoOptions_(p,e,d){
 const t=p.tables;let options=[''];
 if(!autoActive_(e,d))return options;
 for(const combo of ['A','B','C','AB','AC','BC','ABC']){
  let rules=(t.AllowedShifts||[]).filter(r=>r.combination===combo&&autoMatches_(r,e,d));const exact=rules.filter(r=>r.employeeId===e.employeeId);if(exact.length)rules=exact;
  if(rules.length===1&&rules[0].allowed===true)options.push(combo);
 }
 const hard=(t.EmployeeAvailability||[]).concat(t.RecurringAvailability||[]).filter(r=>r.isHard===true&&autoMatches_(r,e,d));
 const force=(t.ForcedShifts||[]).filter(r=>autoMatches_(r,e,d));
 const locks=(t.AssignmentLocks||[]).filter(r=>r.locked===true&&autoMatches_(r,e,d));
 const leave=(t.LeaveRequests||[]).filter(r=>r.employeeId===e.employeeId&&['APPROVED','已核准'].includes(r.status)&&r.startDate<=d&&r.endDate>=d);
 const holiday=(t['個人假日設定']||[]).filter(r=>autoMatches_(r,e,d));
 const combos=(t['組合優先設定']||[]).filter(r=>r.mode==='REQUIRE'&&autoMatches_(r,e,d));
 return options.filter(c=>{
  if(c&&(p.calendar[d].isOperatingDay!==true||holiday.length))return false;
  if([...c].some(s=>p.demands[d+s]?.isClosed||p.demands[d+s]?.MaxStaff===0))return false;
  if(force.some(r=>!c.includes(r.shiftId))||hard.some(r=>['REQUIRE_SHIFT','WORK'].includes(r.conditionType)&&!c.includes(r.shiftId)))return false;
  if(hard.some(r=>['UNAVAILABLE','OFF'].includes(r.conditionType)&&(!r.shiftId?!!c:c.includes(r.shiftId))))return false;
  if(leave.some(r=>[...String(r.requestedShifts||'ABC')].some(s=>c.includes(s))))return false;
  if(combos.some(r=>c!==r.combination))return false;
  if(locks.some(r=>c.includes(r.shiftId)!==String(p.existing?.[e.employeeId]?.[d]||'').includes(r.shiftId)))return false;
  for(const s of c){const list=(t['班別優先人員']||[]).filter(r=>r.shiftId===s&&autoActive_(r,d)&&(!r.date||r.date===d)&&(!r.weekday||+r.weekday===(new Date(d+'T00:00:00Z').getUTCDay()||7)));if(list.some(r=>r.allowOutsideList===false)&&!list.some(r=>r.employeeId===e.employeeId))return false;}
  return true;
 });
}
function autoEmployeeIssues_(p,e,days,final){
 const errors=[],cap=(k,d)=>{let v=autoBlank_(e[k])?Infinity:e[k];for(const r of p.tables.LegalPolicy||[])if((!r.employmentType||r.employmentType===e.employmentType)&&autoActive_(r,d)&&r.parsed&&!autoBlank_(r.parsed[k]))v=Math.min(v,r.parsed[k]);return v;};
 const all={...p.boundary[e.employeeId],...days},weeks={},intervals=[];let monthDays=0,monthHours=0,lastDay=null,run=0;
 const sorted=Object.keys(all).sort();
 for(const d of sorted){const combo=all[d]||'';if(!autoCombo_(combo)){errors.push('班別格式錯誤');continue;}let hours=0;
  for(const s of combo){const def=p.shifts[s];if(!def)continue;hours+=def.minutes/60;intervals.push({date:d,shift:s,start:autoDay_(d)*1440+def.start,end:autoDay_(d)*1440+def.end});}
  if(d.startsWith(p.month)){
   if(combo){monthDays++;monthHours+=hours;}
   if(hours>cap('maxDailyHours',d)||combo.length>cap('maxDailyShifts',d))errors.push(d+' 每日工時／班數超限');
   if(final&&!autoOptions_(p,e,d).includes(combo))errors.push(d+' 班別違反可排班／指定／鎖定／休假設定');
  }
  if(combo){const day=autoDay_(d);run=lastDay===day-1?run+1:1;lastDay=day;if(run>cap('maxConsecutiveDays',d))errors.push(d+' 連續出勤超限');}
  else{run=0;lastDay=null;}
  const key=autoWeek_(p,d);if(!weeks[key])weeks[key]={days:0,hours:0,shifts:0,dates:[]};const w=weeks[key];w.days+=combo?1:0;w.hours+=hours;w.shifts+=combo.length;w.dates.push(d);
 }
 if(monthDays>cap('maxMonthlyWorkDays',p.dates[0])||monthHours>cap('maxMonthlyHours',p.dates[0])||!autoBlank_(e.minMonthlyRestDays)&&p.dates.length-monthDays<e.minMonthlyRestDays)errors.push('每月工時／工作天數／休息天數超限');
 for(const [key,w]of Object.entries(weeks)){
  if(!w.dates.some(d=>d.startsWith(p.month)))continue;
  const dates=w.dates.filter(d=>d.startsWith(p.month));
  if(dates.some(d=>w.days>cap('maxWeeklyWorkDays',d)||w.hours>cap('maxWeeklyHours',d)||w.shifts>cap('maxWeeklyShifts',d)))errors.push(key+' 整週工時／天數／班數超限');
  if(final&&((!autoBlank_(e.minWeeklyHours)&&w.hours<e.minWeeklyHours)||(!autoBlank_(e.minWeeklyShifts)&&w.shifts<e.minWeeklyShifts)))errors.push(key+' 每週最低工時／班數未達');
 }
 intervals.sort((a,b)=>a.start-b.start);
 for(let i=1;i<intervals.length;i++){
  const a=intervals[i-1],b=intervals[i];if(!a.date.startsWith(p.month)&&!b.date.startsWith(p.month))continue;
  if(b.start<a.end)errors.push(b.date+' 班次重疊');
  let rest=e.minRestHours||0;for(const r of p.tables.LegalPolicy||[])if((!r.employmentType||r.employmentType===e.employmentType)&&autoActive_(r,b.date))rest=Math.max(rest,r.parsed?.minRestHours||0,(r.minRestMinutes||0)/60);
  // Rest-gap policy applies between workdays; breaks within an allowed same-day combination are represented in shift definitions.
  if(a.date!==b.date&&b.start-a.end<rest*60)errors.push(b.date+' 班間休息不足');
  if((p.tables.ShiftTransitions||[]).some(r=>autoMatches_(r,e,b.date)&&r.ruleMode==='FORBID'&&r.fromShiftId===a.shift&&r.toShiftId===b.shift))errors.push(b.date+' 禁止班別銜接');
 }
 for(const r of p.tables['組合優先設定']||[])if(!autoBlank_(r.maxPerWeek)){const counts={};for(const d of p.dates)if(autoMatches_(r,e,d)&&days[d]===r.combination){const key=autoWeek_(p,d);counts[key]=(counts[key]||0)+1;}if(Object.values(counts).some(n=>n>r.maxPerWeek))errors.push('組合每週次數超限');}
 return {errors:[...new Set(errors)],hours:monthHours,workDays:monthDays,shifts:Object.values(days).reduce((n,s)=>n+s.length,0)};
}
function autoQualifications_(p,plan,date,shift){
 const assigned=p.employees.filter(e=>plan[e.employeeId]?.[date]?.includes(shift)),demands=(p.tables.ShiftQualificationDemands||[]).filter(r=>r.date===date&&r.shiftId===shift),errors=[];
 const eligible=(e,q)=>(p.tables.EmployeeQualifications||[]).some(r=>r.employeeId===e.employeeId&&r.qualificationId===q&&r.verifiedForLegalDuty===true&&autoActive_(r,date));
 for(const q of demands)if(assigned.filter(e=>eligible(e,q.qualificationId)).length<q.minimumQualifiedCount)errors.push(date+' '+shift+' 資格 '+q.qualificationId+' 人數不足');
 const slots=demands.filter(q=>q.distinctPersonRequirement).flatMap(q=>Array(q.minimumQualifiedCount).fill(q.qualificationId)),matching={};
 function match(q,seen){for(const e of assigned)if(!seen.has(e.employeeId)&&eligible(e,q)){seen.add(e.employeeId);if(!matching[e.employeeId]||match(matching[e.employeeId],seen)){matching[e.employeeId]=q;return true;}}return false;}
 if(slots.some(q=>!match(q,new Set())))errors.push(date+' '+shift+' 資格名額需要不同人員');return errors;
}
function autoValidatePlan_(p,plan){
 const errors=[],stats=[];if(p.issues.length)return {ok:false,errors:p.issues.map(x=>x.message),stats};
 if(Object.keys(plan).length!==p.employees.length||Object.keys(plan).some(id=>!p.employees.some(e=>e.employeeId===id)))errors.push('班表員工集合不符');
 for(const e of p.employees){const days=plan[e.employeeId]||{};if(Object.keys(days).length!==p.dates.length||p.dates.some(d=>!Object.prototype.hasOwnProperty.call(days,d)))errors.push(e.employeeId+' 日期集合不符');const r=autoEmployeeIssues_(p,e,days,true);errors.push(...r.errors.map(x=>e.employeeId+' '+x));stats.push({id:e.employeeId,name:e.displayName,hours:r.hours,workDays:r.workDays,shifts:r.shifts,targetHours:autoBlank_(e.targetMonthlyHours)?null:e.targetMonthlyHours,hourDifference:autoBlank_(e.targetMonthlyHours)?null:r.hours-e.targetMonthlyHours});}
 for(const d of p.dates)for(const s of 'ABC'){
  const n=p.employees.filter(e=>plan[e.employeeId]?.[d]?.includes(s)).length,r=p.demands[d+s];if(n<r.requiredHeadcount||n>r.MaxStaff)errors.push(d+' '+s+' 人數 '+n+' 不在 '+r.requiredHeadcount+'–'+r.MaxStaff+' 內');errors.push(...autoQualifications_(p,plan,d,s));
  for(const r of p.tables.PairingRules||[])if(r.isHard&&autoActive_(r,d)){const a=!!plan[r.employeeA]?.[d]?.includes(s),b=!!plan[r.employeeB]?.[d]?.includes(s);if(r.pairingMode==='REQUIRED_TOGETHER'&&a!==b||r.pairingMode==='FORBIDDEN_TOGETHER'&&a&&b)errors.push(d+' '+s+' 搭班硬限制衝突');}
 }
 return {ok:errors.length===0,errors:[...new Set(errors)],stats};
}
