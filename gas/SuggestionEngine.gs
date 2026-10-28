// Pure, deterministic constraint scheduler. No network, credentials or employee data.
const SUGGESTION_ENGINE_VERSION_ = 'rules-1';
function buildScheduleSuggestion_(tables, month, mode) {
 const issues=[],warnings=[],add=(sheet,message)=>issues.push({sheet,message});
 const raw=n=>tables[n]||[],rows=n=>{const a=raw(n),h=a[0]||[];return a.slice(1).filter(r=>r.some(v=>v!==''&&v!==false&&v!=null)).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]??''])));};
 const num=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const has=v=>v!==''&&v!==undefined&&v!==null;
 const required={
  '員工基本資料':['員工代碼','姓名','啟用','每日工時上限','每週工時上限','最多連續出勤天數','每週最多工作日','最少班間休息時數'],
  '班別時間設定':['班別','開始時間','結束時間','結束跨日天數','不計工時休息分鐘'],
  '日曆設定':['日期','營業日'],'每日班別人力需求':['日期','班別','最低人數','最高人數','此班休診'],
  '允許班別組合':['員工代碼','同日班別組合','允許此組合'],'排班控制':['參數代碼','設定值'],
  '指定日期可排時段':['員工代碼','日期','班別','可排班條件'],'每週固定可排時段':['員工代碼','星期','班別','可排班條件'],
  '請假申請':['員工代碼','開始日期','結束日期','請假班別','狀態'],'指定班別':['員工代碼','日期','班別'],
  '排班鎖定設定':['員工代碼','日期','班別','鎖定'],'個人假日設定':['員工代碼','日期','排班政策'],
  '班別資格需求':['日期','班別','資格代碼','最低合格人數','須由不同人員擔任'],
  '員工資格與技能':['員工代碼','資格代碼','資格已核實'],'員工排班偏好':['員工代碼','偏好類型'],
  '組合優先設定':['員工代碼','同日班別組合','偏好／強制'],'班別優先人員':['員工代碼','班別','允許名單外補人']
 };
 for(const [tab,keys] of Object.entries(required))if(raw(tab).length){const h=raw(tab)[0];if(keys.some(k=>!h.includes(k))||new Set(h).size!==h.length)add(tab,'欄位缺漏或重複，請恢復中文欄位標題。');}
 for(const tab of Object.keys(required))for(const r of rows(tab)){
  for(const k of ['日期','生效日期','截止日期','開始日期','結束日期'])if(has(r[k])&&(typeof r[k]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r[k])||!Number.isFinite(Date.parse(r[k]+'T00:00:00Z'))||new Date(r[k]+'T00:00:00Z').toISOString().slice(0,10)!==r[k]))add(tab,'日期格式無效：'+k+'，請使用 YYYY-MM-DD。');
  if(r['生效日期']&&r['截止日期']&&r['生效日期']>r['截止日期']||r['開始日期']&&r['結束日期']&&r['開始日期']>r['結束日期'])add(tab,'開始／生效日期晚於結束／截止日期。');
 }
 const iso=t=>new Date(t).toISOString().slice(0,10), dayMS=86400000;
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!['fill','rebuild'].includes(mode))throw Error('月份或建議模式不正確。');
 const first=Date.parse(month+'-01T00:00:00Z'),count=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
 const dates=Array.from({length:count},(_,i)=>iso(first+i*dayMS)),last=dates[count-1];
 const wd=d=>new Date(d+'T00:00:00Z').getUTCDay()||7;
 const active=(r,d)=>(!r['生效日期']||r['生效日期']<=d)&&(!r['截止日期']||r['截止日期']>=d);
 const relevant=r=>(!r['生效日期']||r['生效日期']<=last)&&(!r['截止日期']||r['截止日期']>=dates[0]);
 const keyed=(list,key,tab)=>{const m=new Map();for(const r of list){const k=key(r);if(m.has(k))add(tab,'設定重複：'+k);m.set(k,r);}return m;};
 const employees=rows('員工基本資料').filter(e=>e['啟用']===true&&relevant(e));
 const ids=keyed(employees,e=>e['員工代碼'],'員工基本資料');
 if(!employees.length)add('員工基本資料','沒有啟用中的員工。');
 if(employees.length>100)add('員工基本資料','此版本最多支援 100 位員工。');
 for(const e of employees){
  if(!e['員工代碼']||!e['姓名'])add('員工基本資料','員工代碼與姓名不可空白。');
  if(['__proto__','constructor','prototype'].includes(e['員工代碼']))add('員工基本資料','員工代碼使用保留字。');
  for(const k of ['每日工時上限','每週工時上限','最多連續出勤天數','每週最多工作日','最少班間休息時數'])if(!num(e[k]))add('員工基本資料',e['姓名']+'：請確認'+k+'（允許明確填 0）。');
  for(const k of ['月目標工時','月最低休息天數','月最多工作天數','月工時上限','每日最多班數','月目標出勤天數','每週最低工時','每週最低班數','每週最高班數','偏好每日最低工時'])if(has(e[k])&&!num(e[k]))add('員工基本資料',e['姓名']+'：'+k+'格式不正確。');
  if(e['最多連續出勤天數']>31||e['每週最多工作日']>7)add('員工基本資料',e['姓名']+'：連續天數或每週天數超出支援範圍。');
  for(const k of ['月最低休息天數','月最多工作天數','最多連續出勤天數','每週最多工作日','每日最多班數','月目標出勤天數','每週最低班數','每週最高班數'])if(has(e[k])&&!Number.isInteger(e[k]))add('員工基本資料',e['姓名']+'：'+k+'須為整數。');
 }
 const shifts=keyed(rows('班別時間設定').filter(relevant),r=>r['班別'],'班別時間設定'),times={};
 for(const s of ['A','B','C']){
  const r=shifts.get(s),parse=v=>/^\d{2}:\d{2}$/.test(v)?+v.slice(0,2)*60 + +v.slice(3):NaN;
  if(!r){add('班別時間設定','缺少班別 '+s);continue;}
  const a=parse(r['開始時間']),b=parse(r['結束時間']),rest=r['不計工時休息分鐘'];
  if(!num(rest)||!Number.isInteger(rest))add('班別時間設定',s+'：請確認不計工時休息分鐘；沒有請填 0。');
  if(!Number.isFinite(a)||!Number.isFinite(b)||b<=a||b>1440||r['結束跨日天數']!==0||r['休息規則']||r['工時計算方式']||!active(r,dates[0])||!active(r,last))add('班別時間設定',s+'：本版支援整月有效、同日固定時間、明確休息分鐘；其他工時計算規則尚不支援。');
  times[s]={start:a,end:b,hours:(b-a-rest)/60};
  // The existing manual calendar uses these hours. Never publish inconsistent totals.
  if(num(rest)&&times[s].hours!==({A:4,B:4,C:3}[s]))add('班別時間設定',s+'：與目前網站工時計算不一致，須先同步班表工時計算器。');
 }
 if([...shifts.keys()].some(s=>!['A','B','C'].includes(s)))add('班別時間設定','目前月班表僅支援 A、B、C。');
 const calendar=keyed(rows('日曆設定').filter(r=>dates.includes(r['日期'])),r=>r['日期'],'日曆設定');
 const demands=keyed(rows('每日班別人力需求').filter(r=>dates.includes(r['日期'])),r=>r['日期']+'|'+r['班別'],'每日班別人力需求');
 const slots=[];
 for(const d of dates){
  const c=calendar.get(d);
  if(!c||typeof c['營業日']!=='boolean')add('日曆設定',d+'：請確認營業日。');
  for(const s of ['A','B','C']){
   const r=demands.get(d+'|'+s);
   if(!r){add('每日班別人力需求',d+' '+s+'：缺少人力需求。');continue;}
   if(typeof r['此班休診']!=='boolean')add('每日班別人力需求',d+' '+s+'：請明確確認此班休診。');
   const closed=c?.['營業日']===false||r['此班休診']===true;
   let min=r['最低人數'],max=r['最高人數'],ideal=has(r['理想人數'])?r['理想人數']:min;
   if(closed){if([min,max,ideal].some(v=>num(v)&&v>0))add('每日班別人力需求',d+' '+s+'：休診與人力需求衝突。');min=max=ideal=0;}
   else if(![min,max,ideal].every(v=>num(v)&&Number.isInteger(v))||min>ideal||ideal>max)add('每日班別人力需求',d+' '+s+'：請填有效最低／最高人數，理想人數須在兩者之間。');
   slots.push({date:d,shift:s,min,max,ideal});
  }
 }
 if([...demands.values()].some(r=>!['A','B','C'].includes(r['班別'])))add('每日班別人力需求','人力需求包含不支援的班別。');
 const combos=rows('允許班別組合').filter(relevant),comboList=['A','B','C','AB','AC','BC','ABC'];
 const allowed=(e,d,s)=>{const own=combos.filter(r=>r['員工代碼']===e['員工代碼']&&r['同日班別組合']===s&&active(r,d));const all=combos.filter(r=>r['員工代碼']==='ALL'&&r['同日班別組合']===s&&active(r,d));const chosen=own.length?own:all;return chosen.length===1&&chosen[0]['允許此組合']===true;};
 for(const e of employees)if(!dates.some(d=>comboList.some(s=>allowed(e,d,s))))add('允許班別組合',e['姓名']+'：沒有任何明確允許的班別組合。');
 for(const r of combos)if(!comboList.includes(r['同日班別組合'])||typeof r['允許此組合']!=='boolean'||(!ids.has(r['員工代碼'])&&r['員工代碼']!=='ALL'))add('允許班別組合','員工、組合或允許設定無效。');
 // Never silently ignore advanced constraints that this engine cannot interpret.
 for(const tab of ['員工搭班規則','班別銜接規則','法規政策設定','員工設定歷程','跨月資料完整性'])if(rows(tab).filter(relevant).length)add(tab,'此版本尚不支援這張表的進階規則；請先擴充規則處理，不能略過後套用。');
 const control=Object.fromEntries(rows('排班控制').map(r=>[r['參數代碼'],r['設定值']])),weekStart=control.WEEK_START_DAY;
 if(!Number.isInteger(weekStart)||weekStart<1||weekStart>7)add('排班控制','每週起始日須為 1 至 7。');
 const week=d=>iso(Date.parse(d+'T00:00:00Z')-((wd(d)-weekStart+7)%7)*dayMS);
 const weight=k=>has(control[k])&&num(control[k])?control[k]:0;
 for(const k of ['NIGHT_FAIRNESS_WEIGHT','HOLIDAY_FAIRNESS_WEIGHT','SHIFT_PREFERENCE_WEIGHT','LEAVE_PREFERENCE_WEIGHT','STABILITY_WEIGHT'])if(has(control[k])&&!num(control[k]))add('排班控制',k+' 須為非負數。');
 const currentRows=raw('月班表').slice(1).filter(r=>r[0]===month),old=keyed(currentRows,r=>r[1],'月班表');
 for(const r of currentRows)if(!ids.has(r[1]))add('月班表','本月已有未啟用或任職期間不符的員工，請先確認：'+r[1]);
 const original=Object.fromEntries(employees.map(e=>[e['員工代碼'],dates.map((d,i)=>String(old.get(e['員工代碼'])?.[i+3]||''))]));
 if(Object.values(original).flat().some(s=>s&&!comboList.includes(s)))add('月班表','現有班表含不支援班別。');
 const availability=rows('指定日期可排時段').filter(r=>dates.includes(r['日期'])&&relevant(r)),recurring=rows('每週固定可排時段').filter(relevant),leave=rows('請假申請').filter(r=>r['開始日期']<=last&&r['結束日期']>=dates[0]);
 const holidays=rows('個人假日設定').filter(r=>dates.includes(r['日期'])),forced=rows('指定班別').filter(r=>dates.includes(r['日期'])&&relevant(r)),locks=rows('排班鎖定設定').filter(r=>dates.includes(r['日期'])&&r['鎖定']===true);
 const preferences=rows('員工排班偏好').filter(relevant),priorities=rows('班別優先人員').filter(relevant),comboprefs=rows('組合優先設定').filter(relevant);
 for(const [tab,list] of [['指定日期可排時段',availability],['每週固定可排時段',recurring],['請假申請',leave],['個人假日設定',holidays],['指定班別',forced],['排班鎖定設定',locks],['員工排班偏好',preferences],['班別優先人員',priorities],['組合優先設定',comboprefs]])for(const r of list)if(!ids.has(r['員工代碼']))add(tab,'未知或非當月啟用員工：'+r['員工代碼']);
 for(const r of [...availability,...recurring])if(!['AVAILABLE','UNAVAILABLE','PREFER_OFF','REQUIRE_SHIFT'].includes(r['可排班條件'])||!['A','B','C'].includes(r['班別']))add('指定日期可排時段','無法辨識的可排班條件或班別。');
 for(const r of recurring)if(!Number.isInteger(r['星期'])||r['星期']<1||r['星期']>7)add('每週固定可排時段','星期須為 1 至 7。');
 const leaveShifts=r=>{const v=String(r['請假班別']);if(v===''||v==='ALL'||v==='全天')return 'ABC';try{const a=JSON.parse(v);if(Array.isArray(a))return a.join('');}catch(_){}return v.replace(/[,、\s]/g,'');};
 for(const r of leave)if(!['APPROVED','核准','已核准','PENDING','待審核','REJECTED','駁回','CANCELLED','取消'].includes(r['狀態'])||!/^A?B?C?$/.test(leaveShifts(r)))add('請假申請','請假狀態或班別無法辨識。');
 for(const r of holidays)if(!['禁止排班','需人工確認'].includes(r['排班政策']))add('個人假日設定','無法辨識排班政策。');
 for(const r of [...forced,...locks])if(r['班別']&&!comboList.includes(r['班別']))add('指定班別','指定／鎖定班別無效。');
 for(const r of locks)if(r['班別']&&![...r['班別']].every(c=>(original[r['員工代碼']]?.[dates.indexOf(r['日期'])]||'').includes(c)))add('排班鎖定設定',r['日期']+' '+r['員工代碼']+'：鎖定班別與現有班表不符。');
 for(const r of comboprefs)if(!comboList.includes(r['同日班別組合'])||!['PREFER','REQUIRE'].includes(r['偏好／強制'])||has(r['每週最多次數'])&&!num(r['每週最多次數']))add('組合優先設定','組合、偏好／強制或每週最多次數無效。');
 for(const r of preferences)if(!['PREFER','AVOID'].includes(r['偏好類型'])||r['班別']&&!comboList.includes(r['班別']))add('員工排班偏好','偏好類型或班別無法辨識。');
 for(const r of priorities)if(!['A','B','C'].includes(r['班別'])||typeof r['允許名單外補人']!=='boolean')add('班別優先人員','班別或名單外補人設定無效。');
 const qualifications=rows('員工資格與技能'),qdemands=rows('班別資格需求').filter(r=>dates.includes(r['日期']));
 for(const r of qdemands)if(!['A','B','C'].includes(r['班別'])||!Number.isInteger(r['最低合格人數'])||r['最低合格人數']<0||r['須由不同人員擔任']===true)add('班別資格需求','本版支援一般資格人數；資格分別由不同人員擔任的分配尚未支援。');
 const qualified=(id,q,d)=>qualifications.some(r=>r['員工代碼']===id&&r['資格代碼']===q&&r['資格已核實']===true&&active(r,d));
 const match=(r,e,d)=>(r['員工代碼']===e['員工代碼'])&&active(r,d)&&(!r['日期']||r['日期']===d)&&(!r['星期']||+r['星期']===wd(d));
 const history={};let historyMissing=0;
 for(const e of employees){
  const id=e['員工代碼'];history[id]={};const extent=Math.max(6,e['最多連續出勤天數']||0,Math.ceil((e['最少班間休息時數']||0)/24));
  if(extent>31){add('員工基本資料',e['姓名']+'：班間休息跨越超過 31 天，尚不支援。');continue;}
  for(let i=-extent;i<count+extent;i++){if(i>=0&&i<count)continue;const d=iso(first+i*dayMS),m=d.slice(0,7),found=raw('月班表').slice(1).filter(r=>r[0]===m&&r[1]===id);
   if(found.length!==1||String(found[0][35]||'').includes('未提供')){historyMissing++;continue;}
   const s=String(found[0][+d.slice(8)+2]||'');if(s&&!comboList.includes(s)){add('月班表','跨月班別資料無效：'+id+' '+d);continue;}history[id][d]=s;
  }
 }
 const total=s=>[...s].reduce((a,b)=>a+(times[b]?.hours||0),0);
 const capacity=Object.fromEntries(slots.map(s=>[s.date+'|'+s.shift,s]));
 const fixed={},base={};
 for(const e of employees){const id=e['員工代碼'];base[id]=dates.map((d,i)=>{
  const lock=locks.some(r=>match(r,e,d));if(lock)fixed[id+'|'+d]=original[id][i];
  let s=(mode==='fill'||lock)?original[id][i]:'';
  for(const r of forced.filter(r=>match(r,e,d)))s=[...new Set(s+r['班別'])].sort().join('');
  for(const r of [...availability,...recurring].filter(r=>match(r,e,d)&&r['可排班條件']==='REQUIRE_SHIFT'))s=[...new Set(s+r['班別'])].sort().join('');
  for(const r of comboprefs.filter(r=>match(r,e,d)&&r['偏好／強制']==='REQUIRE'))s=[...new Set(s+r['同日班別組合'])].sort().join('');
  return s;
 });}
 const employeeErrors=(e,arr)=>{
  const out=[],id=e['員工代碼'],all={...history[id],...Object.fromEntries(dates.map((d,i)=>[d,arr[i]]))},weeks={};
  let hours=0,days=0;
  for(const d of Object.keys(all).sort()){const s=all[d],inMonth=d.slice(0,7)===month,w=week(d);if(!weeks[w])weeks[w]={hours:0,days:0,shifts:0};weeks[w].hours+=total(s);weeks[w].days+=s?1:0;weeks[w].shifts+=s.length;
   if(!inMonth)continue;hours+=total(s);days+=s?1:0;
   if(fixed[id+'|'+d]!==undefined&&fixed[id+'|'+d]!==s)out.push(d+' 鎖定班次變更');
   if(!s)continue;
   if(!active(e,d)||!allowed(e,d,s))out.push(d+' 不允許的班別組合或不在任職期間');
   if(comboprefs.some(r=>match(r,e,d)&&r['偏好／強制']==='REQUIRE'&&r['同日班別組合']!==s))out.push(d+' 必須安排的完整組合不符');
   if(total(s)>e['每日工時上限']||has(e['每日最多班數'])&&s.length>e['每日最多班數'])out.push(d+' 每日上限');
   for(let j=1;j<s.length;j++)if(times[s[j-1]]?.end>times[s[j]]?.start)out.push(d+' 班別時間重疊');
   for(const r of [...availability,...recurring].filter(r=>match(r,e,d)))if(r['可排班條件']==='UNAVAILABLE'&&s.includes(r['班別'])||r['必須遵守']===true&&r['可排班條件']==='PREFER_OFF'&&s.includes(r['班別']))out.push(d+' 不可排班');
   if(leave.some(r=>r['員工代碼']===id&&['APPROVED','核准','已核准','PENDING','待審核'].includes(r['狀態'])&&r['開始日期']<=d&&r['結束日期']>=d&&[...leaveShifts(r)].some(c=>s.includes(c))))out.push(d+' 核准或待審請假');
   if(holidays.some(r=>match(r,e,d)))out.push(d+' 個人假日禁止或尚待人工確認');
   for(const c of s){const p=priorities.filter(r=>active(r,d)&&(!r['日期']||r['日期']===d)&&(!r['星期']||+r['星期']===wd(d))&&r['班別']===c);if(p.some(r=>r['允許名單外補人']===false)&&!p.some(r=>r['員工代碼']===id))out.push(d+' 不在班別允許名單');}
   let streak=0,t=Date.parse(d+'T00:00:00Z');while(all[iso(t)]){streak++;t-=dayMS;}if(streak>e['最多連續出勤天數'])out.push(d+' 連續出勤上限');
  }
  const occupied=Object.keys(all).sort().filter(d=>all[d]);
  for(let i=1;i<occupied.length;i++){const a=occupied[i-1],b=occupied[i];if(a.slice(0,7)!==month&&b.slice(0,7)!==month)continue;const sa=all[a],sb=all[b],gap=(Date.parse(b)-Date.parse(a))/3600000+(times[sb[0]]?.start-times[sa[sa.length-1]]?.end)/60;if(gap<e['最少班間休息時數'])out.push(b+' 班間休息不足');}
  // A following-month workday can complete a prohibited streak.
  let streak=0,prev='';for(const d of occupied){streak=Date.parse(d)-Date.parse(prev)===dayMS?streak+1:1;prev=d;if(streak>e['最多連續出勤天數']&&Date.parse(d)-first<(count+e['最多連續出勤天數'])*dayMS)out.push(d+' 跨月連續出勤上限');}
  if(has(e['月工時上限'])&&hours>e['月工時上限']||has(e['月最多工作天數'])&&days>e['月最多工作天數']||has(e['月最低休息天數'])&&count-days<e['月最低休息天數'])out.push('每月工時／出勤／休息上限');
  for(const [w,v] of Object.entries(weeks))if(dates.some(d=>week(d)===w)&&(v.hours>e['每週工時上限']||v.days>e['每週最多工作日']||has(e['每週最高班數'])&&v.shifts>e['每週最高班數']))out.push(w+' 每週上限');
  for(const r of comboprefs.filter(r=>r['員工代碼']===id&&has(r['每週最多次數'])))for(const w of new Set(dates.map(week)))if(Object.entries(all).filter(([d,s])=>week(d)===w&&active(r,d)&&s===r['同日班別組合']).length>r['每週最多次數'])out.push(w+' 組合次數上限');
  return [...new Set(out)];
 };
 if(issues.length)return {month,mode,engine:SUGGESTION_ENGINE_VERSION_,ready:false,canApply:false,issues,warnings,employees:[],coverage:[]};
 if(historyMissing)warnings.push({sheet:'月班表',message:'缺少 '+historyMissing+' 筆相鄰月份員工日期資料；跨月檢查未完成，可預覽但不可套用。',blocking:true});
 for(const e of employees)for(const msg of employeeErrors(e,base[e['員工代碼']]))add('月班表',e['姓名']+'：'+msg+'（保留／鎖定／指定班次）');
 const counts=(plan,d,c)=>employees.filter(e=>plan[e['員工代碼']][dates.indexOf(d)].includes(c)).length;
 for(const slot of slots)if(counts(base,slot.date,slot.shift)>slot.max)add('每日班別人力需求',slot.date+' '+slot.shift+'：保留班次超過最高人數或排到休診。');
 if(issues.length)return {month,mode,engine:SUGGESTION_ENGINE_VERSION_,ready:false,canApply:false,issues,warnings,employees:[],coverage:[]};
 const plan=JSON.parse(JSON.stringify(base));
 // Greedy whole-combination additions: shortages first, then ideal headcount.
 // Deterministic and bounded; no claim of optimality or proof of infeasibility.
 for(const goal of ['min','ideal']) for(let dayIndex=0;dayIndex<count;dayIndex++){
  let steps=0;while(steps++<employees.length*3){let best=null;
   for(const i of [dayIndex]){const d=dates[i];if(!slots.some(s=>s.date===d&&counts(plan,d,s.shift)<s[goal]))continue;
    for(const e of employees){const id=e['員工代碼'],before=plan[id][i];if(fixed[id+'|'+d]!==undefined)continue;
     for(const combo of comboList){if(combo===before||![...before].every(c=>combo.includes(c))||!allowed(e,d,combo))continue;const added=[...combo].filter(c=>!before.includes(c));if(added.some(c=>counts(plan,d,c)>=capacity[d+'|'+c].max))continue;
      const gain=added.reduce((n,c)=>n+(counts(plan,d,c)<capacity[d+'|'+c][goal]?1:0),0);if(!gain)continue;
      const next=plan[id].slice();next[i]=combo;if(employeeErrors(e,next).length)continue;
      const h=plan[id].reduce((n,s)=>n+total(s),0),target=has(e['月目標工時'])?e['月目標工時']:0;
      let score=gain*100000+(target?Math.abs(h-target)-Math.abs(h+total(combo)-total(before)-target):0)*100-h;
      for(const q of qdemands.filter(q=>q['日期']===d&&added.includes(q['班別'])))if(qualified(id,q['資格代碼'],d)&&employees.filter(x=>plan[x['員工代碼']][i].includes(q['班別'])&&qualified(x['員工代碼'],q['資格代碼'],d)).length<q['最低合格人數'])score+=50000;
      if(has(e['月目標出勤天數'])&&!before)score+=plan[id].filter(Boolean).length<e['月目標出勤天數']?20:-20;
      if(has(e['偏好每日最低工時'])&&total(combo)<e['偏好每日最低工時'])score-=10;
      score-=added.includes('C')?weight('NIGHT_FAIRNESS_WEIGHT')*plan[id].filter(s=>s.includes('C')).length:0;
      if(calendar.get(d)?.['國定假日']||calendar.get(d)?.['週末'])score-=weight('HOLIDAY_FAIRNESS_WEIGHT')*dates.filter((x,j)=>plan[id][j]&&(calendar.get(x)?.['國定假日']||calendar.get(x)?.['週末'])).length;
      if(combo===original[id][i])score+=weight('STABILITY_WEIGHT');
      for(const r of preferences.filter(r=>match(r,e,d)&&(!r['假日類型']||r['假日類型']===calendar.get(d)?.['假日類型'])))if(!r['班別']||[...r['班別']].some(c=>added.includes(c)))score+=(r['偏好類型']==='PREFER'?1:-1)*weight('SHIFT_PREFERENCE_WEIGHT')/(1+(+r['偏好順位']||0));
      for(const r of [...availability,...recurring].filter(r=>match(r,e,d)&&r['可排班條件']==='PREFER_OFF'))if(added.includes(r['班別']))score-=weight('LEAVE_PREFERENCE_WEIGHT');
      for(const r of comboprefs.filter(r=>match(r,e,d)&&r['同日班別組合']===combo))score+=1/(1+(+r['優先順位']||0));
      for(const r of priorities.filter(r=>match(r,e,d)&&added.includes(r['班別'])))score+=1/(1+(+r['優先順位']||0));
      if(!best||score>best.score)best={id,i,combo,score};
     }
    }
   }if(!best)break;plan[best.id][best.i]=best.combo;
  }
 }
 const coverage=slots.map(s=>({...s,actual:counts(plan,s.date,s.shift),shortage:Math.max(0,s.min-counts(plan,s.date,s.shift))}));
 for(const c of coverage)if(c.shortage)add('每日班別人力需求',c.date+' '+c.shift+'：仍缺 '+c.shortage+' 人。');
 for(const r of qdemands){const actual=employees.filter(e=>plan[e['員工代碼']][dates.indexOf(r['日期'])].includes(r['班別'])&&qualified(e['員工代碼'],r['資格代碼'],r['日期'])).length;if(actual<r['最低合格人數'])add('班別資格需求',r['日期']+' '+r['班別']+'：資格 '+r['資格代碼']+' 缺 '+(r['最低合格人數']-actual)+' 人。');}
 for(const e of employees){const id=e['員工代碼'];for(const msg of employeeErrors(e,plan[id]))add('月班表',e['姓名']+'：'+msg);
  for(const w of new Set(dates.map(week))){const full=Array.from({length:7},(_,i)=>iso(Date.parse(w)+i*dayMS)),all={...history[id],...Object.fromEntries(dates.map((d,i)=>[d,plan[id][i]]))};if(!full.every(d=>Object.hasOwnProperty.call(all,d)))continue;const h=full.reduce((n,d)=>n+total(all[d]),0),s=full.reduce((n,d)=>n+all[d].length,0);if(has(e['每週最低工時'])&&h<e['每週最低工時']||has(e['每週最低班數'])&&s<e['每週最低班數'])add('員工基本資料',e['姓名']+' '+w+'：尚未達每週最低工時／班數。');}
 }
 const output=employees.map(e=>{const id=e['員工代碼'],days=plan[id],hours=days.reduce((n,s)=>n+total(s),0);return {id,name:e['姓名'],days,hours,workDays:days.filter(Boolean).length,targetHours:has(e['月目標工時'])?e['月目標工時']:null,before:original[id],changedDays:days.filter((s,i)=>s!==original[id][i]).length};});
 warnings.push({sheet:'',message:'建議採有限步數的規則搜尋，未達需求不代表無解；月目標工時為優化目標，並非強制上限。',blocking:false});
 return {month,mode,engine:SUGGESTION_ENGINE_VERSION_,ready:true,canApply:issues.length===0&&!warnings.some(w=>w.blocking),issues,warnings,employees:output,coverage};
}
