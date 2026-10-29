const WEEKLY_DEMAND_TAB_='每週固定人力需求';
const WEEKLY_DEMAND_HEADERS_=['星期','班別','套用方式','最低人數','理想人數','最高人數'];
function weeklyDemandAdmin_(){if(requireMember_().role!=='管理者')throw Error('僅管理者可以設定固定人力需求。');}
function weeklyDemandHash_(v){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,stableFormJson_(v)));}
function weeklyDemandTemplate_(rows){
 if(!Array.isArray(rows)||rows.length!==21)throw Error('請設定完整的每週 21 個班別。');
 const seen=new Set();return rows.map(r=>{
  if(!r||!Number.isInteger(r.weekday)||r.weekday<1||r.weekday>7||!['A','B','C'].includes(r.shift)||!['skip','open','closed'].includes(r.mode))throw Error('每週班別格式不正確。');
  const key=r.weekday+r.shift;if(seen.has(key))throw Error('每週班別重複。');seen.add(key);
  const out={weekday:r.weekday,shift:r.shift,mode:r.mode,min:r.min,ideal:r.ideal,max:r.max};
  if(r.mode==='skip'){out.min='';out.ideal='';out.max='';}
  else if(r.mode==='closed'){out.min=0;out.ideal=0;out.max=0;}
  else {for(const k of ['min','max'])if(!Number.isInteger(r[k])||r[k]<0||r[k]>999)throw Error('開診的最低與最高人數須填 0–999 的整數。');if(r.min>r.max)throw Error('最低人數不可大於最高人數。');if(r.ideal!==''&&(!Number.isInteger(r.ideal)||r.ideal<r.min||r.ideal>r.max))throw Error('理想人數須介於最低與最高人數之間，或留空。');}
  return out;
 }).sort((a,b)=>a.weekday-b.weekday||a.shift.localeCompare(b.shift));
}
function weeklyDemandRead_(){
 const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'}));
 const sheet=(meta.sheets||[]).map(s=>s.properties).find(s=>s.title===WEEKLY_DEMAND_TAB_);
 const raw=sheet?(readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'"+WEEKLY_DEMAND_TAB_+"'!A1:F23",{valueRenderOption:'FORMULA'})).values||[]):[];
 if(raw.length&&(raw.length!==22||WEEKLY_DEMAND_HEADERS_.some((h,i)=>h!==raw[0]?.[i])||raw.some(r=>r.some(v=>typeof v==='string'&&v.startsWith('=')))))throw Error('每週固定需求分頁的欄位、列數或公式需要核對，停止覆寫。');
 const template=raw.length?weeklyDemandTemplate_(raw.slice(1).map(r=>({weekday:r[0],shift:r[1],mode:r[2],min:r[3]??'',ideal:r[4]??'',max:r[5]??''}))):Array.from({length:7},(_,i)=>['A','B','C'].map(shift=>({weekday:i+1,shift,mode:'skip',min:'',ideal:'',max:''}))).flat();
 return {sheet,template,hash:weeklyDemandHash_({sheet:sheet?.sheetId??null,raw}),ids:(meta.sheets||[]).map(s=>s.properties.sheetId)};
}
function getWeeklyDemandSettings(){weeklyDemandAdmin_();const w=weeklyDemandRead_();return {template:w.template,templateHash:w.hash};}
function weeklyDemandDate_(v){if(typeof v==='number')return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);return String(v||'');}
function planWeeklyDemands_(data,input){
 if(!input||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||+input.month.slice(0,4)<2000||+input.month.slice(0,4)>2100||!['fill','replace'].includes(input.mode))throw Error('請選擇正確的月份與套用方式。');
 const template=weeklyDemandTemplate_(input.template),h=data.headers,idx=k=>h.indexOf(k);
 for(const k of ['demandId','date','shiftId','requiredHeadcount','idealHeadcount','MaxStaff','isClosed'])if(idx(k)<0)throw Error('人力需求欄位不完整。');
 if(!Array.isArray(input.excludedDates)||input.excludedDates.length>31)throw Error('略過日期格式不正確。');
 const [year,month]=input.month.split('-').map(Number),days=new Date(Date.UTC(year,month,0)).getUTCDate();
 const excluded=new Set(input.excludedDates);for(const d of excluded)if(typeof d!=='string'||!d.startsWith(input.month+'-')||!/^\d{4}-\d{2}-\d{2}$/.test(d)||+d.slice(-2)<1||+d.slice(-2)>days)throw Error('略過日期須在選定月份內。');
 const byKey=new Map();for(const r of data.rows){const date=weeklyDemandDate_(r.cells[idx('date')].value),shift=r.cells[idx('shiftId')].value;if(!date.startsWith(input.month+'-'))continue;const key=date+'|'+shift;if(byKey.has(key))throw Error(date+' '+shift+' 有重複人力需求，請先核對。');byKey.set(key,r);}
 const changes=[];let preserved=0,skipped=0,nextRow=data.rows.length+1;
 for(let day=1;day<=days;day++){
  const date=input.month+'-'+String(day).padStart(2,'0'),weekday=new Date(date+'T00:00:00Z').getUTCDay()||7;
  for(const shift of ['A','B','C']){
   const rule=template.find(r=>r.weekday===weekday&&r.shift===shift);if(excluded.has(date)||rule.mode==='skip'){skipped++;continue;}
   const record=byKey.get(date+'|'+shift),before=record?record.cells.map(c=>c.value):h.map(()=>'');
   if(input.mode==='fill'&&record&&(['requiredHeadcount','idealHeadcount','MaxStaff'].some(k=>before[idx(k)]!=='')||before[idx('isClosed')]===true||['requiredHeadcount','idealHeadcount','MaxStaff','isClosed'].some(k=>record.cells[idx(k)].formula))){preserved++;continue;}
   const values=before.slice();if(!record){values[idx('demandId')]='DEM-'+date+'-'+shift;values[idx('date')]=date;values[idx('shiftId')]=shift;}
   for(const [k,v] of [['requiredHeadcount',rule.min],['idealHeadcount',rule.ideal],['MaxStaff',rule.max],['isClosed',rule.mode==='closed']])values[idx(k)]=v;
   if(values.every((v,i)=>v===before[i]))continue;
   const checked=checkedValues_(data,record?record.row:-1,values),row=record?record.row:nextRow++;
   if(row>=1000)throw Error('人力需求超過網站支援列數，請先整理資料。');
   changes.push({row,created:!record,date,shift,before,values:checked});
  }
 }
 return {template,changes,preserved,skipped};
}
function previewWeeklyDemands(input){
 weeklyDemandAdmin_();const data=snapshotForm_('DailyShiftDemands'),w=weeklyDemandRead_();
 if(input?.fingerprint!==data.fingerprint||input?.templateHash!==w.hash)throw Error('資料已變更，請關閉設定視窗並重新讀取後再試。');
 const plan=planWeeklyDemands_(data,input),token=Utilities.getUuid(),draft={input,hash:weeklyDemandHash_(plan),dataHash:data.fingerprint,templateHash:w.hash};
 CacheService.getUserCache().put('weekly-demands:'+token,JSON.stringify(draft),600);
 return {token,month:input.month,mode:input.mode,preserved:plan.preserved,skipped:plan.skipped,changes:plan.changes.map(c=>({date:c.date,shift:c.shift,created:c.created,before:c.before,after:c.values})),headers:data.headers,templateWillBeSaved:true};
}
function applyWeeklyDemands(input){
 weeklyDemandAdmin_();if(!input||input.confirmed!==true||typeof input.token!=='string'||!/^[\w-]{20,80}$/.test(input.token))throw Error('請先預覽並確認套用。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('其他人正在儲存，請稍後重新預覽。');
 try{
  weeklyDemandAdmin_();const cache=CacheService.getUserCache(),key='weekly-demands:'+input.token,cached=cache.get(key);if(!cached)throw Error('預覽已過期或已送出，請重新讀取確認結果。');
  const draft=JSON.parse(cached),data=snapshotForm_('DailyShiftDemands'),w=weeklyDemandRead_();
  if(data.fingerprint!==draft.dataHash||w.hash!==draft.templateHash)throw Error('資料已變更，請重新讀取與預覽。');
  const plan=planWeeklyDemands_(data,draft.input);if(weeklyDemandHash_(plan)!==draft.hash)throw Error('預覽結果已變更，停止套用。');
  let templateId=w.sheet?.sheetId;const requests=[];
  if(templateId===undefined){templateId=1;while(w.ids.includes(templateId))templateId++;requests.push({addSheet:{properties:{sheetId:templateId,title:WEEKLY_DEMAND_TAB_,gridProperties:{rowCount:100,columnCount:6}}}});}
  else requests.push({duplicateSheet:{sourceSheetId:templateId,newSheetName:'固定需求備份_'+input.token.slice(0,8)}});
  if(plan.changes.length)requests.push({duplicateSheet:{sourceSheetId:data.sheetId,newSheetName:'人力套用前_'+draft.input.month+'_'+input.token.slice(0,8)}});
  const rows=[WEEKLY_DEMAND_HEADERS_,...plan.template.map(r=>[r.weekday,r.shift,r.mode,r.min,r.ideal,r.max])];
  requests.push({updateCells:{start:{sheetId:templateId,rowIndex:0,columnIndex:0},rows:rows.map(r=>({values:r.map(cellValue)})),fields:'userEnteredValue'}});
  const last=Math.max(0,...plan.changes.map(c=>c.row));if(last>=data.rowCount)requests.push({appendDimension:{sheetId:data.sheetId,dimension:'ROWS',length:last-data.rowCount+1}});
  for(const change of plan.changes)change.values.forEach((v,i)=>{if(change.created||v!==change.before[i])requests.push({updateCells:{start:{sheetId:data.sheetId,rowIndex:change.row,columnIndex:i},rows:[{values:[cellValue(v)]}],fields:'userEnteredValue'}});});
  if(snapshotForm_('DailyShiftDemands').fingerprint!==data.fingerprint||weeklyDemandRead_().hash!==w.hash)throw Error('送出前資料已變更，請重新預覽。');
  // One atomic Sheets batch. Never replay a potentially successful write.
  cache.remove(key);Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const verified=snapshotForm_('DailyShiftDemands'),week=weeklyDemandRead_();
  if(weeklyDemandHash_(week.template)!==weeklyDemandHash_(plan.template)||plan.changes.some(c=>{const r=verified.rows.find(r=>r.row===c.row);return !r||c.values.some((v,i)=>v!==r.cells[i]?.value);}))throw Error('寫入已送出但核對未完成，請重新讀取，勿重複套用。');
  return {data:verified,changed:plan.changes.length,month:draft.input.month};
 }finally{lock.releaseLock();}
}
