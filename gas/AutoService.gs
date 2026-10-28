const AUTO_INPUTS_=['Employees','ShiftDefinitions','CalendarDates','DailyShiftDemands','ShiftQualificationDemands','EmployeeQualifications','EmployeePreferences','EmployeeAvailability','RecurringAvailability','LeaveRequests','PairingRules','ShiftTransitions','AssignmentLocks','ForcedShifts','CrossMonthCoverage','LegalPolicy','EmployeeSettingsHistory','AllowedShifts','組合優先設定','班別優先人員','個人假日設定'];
const AUTO_OUTPUTS_=['ScheduleVersions','ScheduleAssignments','AuditLogs'];
const AUTO_MONTH_HEADER_=['年月','員工代碼','姓名',...Array.from({length:31},(_,i)=>String(i+1)),'總工時','資料狀態'];
function autoFields_(name){return CHINESE_FORM_COLUMNS_[name]?CHINESE_FORM_COLUMNS_[name].split(','):AUTO_FIELDS_[name]||[];}
function autoAdmin_(){const m=requireMember_();if(m.role!=='管理者')throw Error('只有管理者可以自動排班。');return m;}
function autoHash_(o){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(o)));}
function autoSnapshot_(month,mode){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!['production','acceptance'].includes(mode))throw Error('月份或模式不正確。');
 const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'})),properties=meta.sheets.map(s=>s.properties),names=mode==='acceptance'?['自動排班驗收']:AUTO_INPUTS_.concat(AUTO_OUTPUTS_,['排班控制','系統參數','月班表','人力需求待填_'+month]);
 const map={},issues=[];
 for(const name of names){const hits=properties.filter(p=>p.title===name||p.title===CHINESE_SHEET_TITLES_[name]);if(hits.length>1)throw Error('工作表重複：'+name);if(!hits.length){if(name==='自動排班驗收'||name.startsWith('人力需求待填_'))continue;issues.push({sheet:name,message:'缺少工作表。'});continue;}map[name]=hits[0];}
 const found=Object.keys(map),ranges=found.map(n=>"'"+map[n].title.replace(/'/g,"''")+"'!A1:"+(n==='月班表'||n==='自動排班驗收'?'AJ':'AZ')+Math.min(1001,map[n].gridProperties.rowCount));
 // Restrict columns to actual grid size; never issue an out-of-bounds range.
 const col=n=>{let out='';for(;n;n=Math.floor((n-1)/26))out=String.fromCharCode(65+(n-1)%26)+out;return out;};
 const bounded=ranges.map((r,i)=>r.replace(/:(AJ|AZ)/,':'+col(Math.min(found[i]==='月班表'||found[i]==='自動排班驗收'?36:52,map[found[i]].gridProperties.columnCount))));
 const result=bounded.length?readSheets_(()=>Sheets.Spreadsheets.Values.batchGet(ACCESS_SHEET_ID,{ranges:bounded,valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'})):{valueRanges:[]};
 if(result.valueRanges.length!==found.length)throw Error('資料讀取不完整。');
 const raw={};found.forEach((n,i)=>{raw[n]=result.valueRanges[i].values||[];if(raw[n].length>=1001)throw Error(n+' 超出本版 1000 列讀取範圍，請先封存歷史資料。');});
 const fingerprint=autoHash_(raw);
 if(mode==='acceptance')return {map,raw,fingerprint,input:autoFixture_(month)};
 const tables={};
 for(const name of AUTO_INPUTS_.concat(AUTO_OUTPUTS_)){
  const rows=raw[name]||[],header=rows[0]||[],observed=AUTO_OBSERVED_HEADERS_[map[name]?.title],fields=autoFields_(name);
  let keys;if(observed){if(observed.some((h,i)=>header[i]!==h)&&fields.some((h,i)=>header[i]!==h))issues.push({sheet:name,message:'欄位順序或名稱與資料契約不同。'});keys=fields;}
  else keys=canonicalFormHeaders_(name,header);
  if(fields.some(k=>!keys.includes(k)))issues.push({sheet:name,message:'必要欄位遺漏或無法辨識。'});
  tables[name]=[];
  rows.slice(1).forEach((row,i)=>{if(row.every(v=>autoBlank_(v)||v===false))return;if(autoBlank_(row[0])){issues.push({sheet:name,row:i+2,message:'這列有資料但缺少識別欄位。'});return;}const record={_row:i+2};keys.forEach((key,j)=>record[key]=row[j]??'');if(row.some(v=>typeof v==='string'&&/^#(REF!|DIV\/0!|VALUE!|N\/A|ERROR!|NAME\?)/.test(v)))issues.push({sheet:name,row:i+2,message:'儲存格公式錯誤。'});tables[name].push(record);});
 }
 const control=raw['排班控制']||[],week=control.slice(1).filter(r=>r[0]==='WEEK_START_DAY');
 const existing={};for(const row of(raw['月班表']||[]).slice(1))if(/^\d{4}-\d{2}$/.test(row[0])&&row[1]){if(row[0]===month&&!tables.Employees.some(e=>e.employeeId===row[1]&&e.active===true)&&row.slice(3,34).some(Boolean))issues.push({sheet:'月班表',message:'本月有未啟用員工的既有班次，請先確認處置，避免人數重複計算。'});if(!existing[row[1]])existing[row[1]]={};for(let i=0;i<new Date(Date.UTC(+row[0].slice(0,4),+row[0].slice(5),0)).getUTCDate();i++){const d=row[0]+'-'+String(i+1).padStart(2,'0');if(Object.prototype.hasOwnProperty.call(existing[row[1]],d))issues.push({sheet:'月班表',message:'同月員工班表重複。'});existing[row[1]][d]=row[i+3]||'';}}
 if(AUTO_MONTH_HEADER_.some((h,i)=>String(raw['月班表']?.[0]?.[i])!==h))issues.push({sheet:'月班表',message:'月班表欄位不符。'});
 // The fill-in sheet is a proposed input overlay, committed only with an approved plan.
 const fill=raw['人力需求待填_'+month],demandUpdates=[];
 if(fill)for(const row of fill.slice(4)){
  if(!String(row[0]||'').startsWith(month)||!row[9])continue;const matches=tables.DailyShiftDemands.filter(r=>r.demandId===row[9]&&r.date===row[0]);if(matches.length!==1){issues.push({sheet:'人力需求待填_'+month,message:'需求來源代碼不符或重複。'});continue;}
  const r=matches[0];for(const[k,j]of [['requiredHeadcount',3],['MaxStaff',4],['idealHeadcount',5],['isClosed',6]])if(!autoBlank_(row[j])&&row[j]!==r[k]){demandUpdates.push({row:r._row,key:k,value:row[j]});r[k]=row[j];}
 }
 return {map,raw,fingerprint,demandUpdates,input:{month,tables,existing,weekStart:week.length===1?week[0][2]:'',issues}};
}
function previewAutoSchedule(input){
 autoAdmin_();input=input||{};const month=String(input.month||''),mode=input.mode||'production',snap=autoSnapshot_(month,mode),p=autoPrepare_(snap.input);
 const result=input.checkOnly?{status:p.issues.length?'NEEDS_INPUT':'CHECKED',issues:p.issues,warnings:p.warnings}:autoSearch_(p,{seed:Math.floor(Math.random()*1000000),budgetMs:15000});
 result.month=month;result.mode=mode;result.employeeCount=p.employees?.length||0;result.dayCount=p.dates?.length||0;result.engine=AUTO_ENGINE_VERSION_;
 if(result.status==='READY'){
  if(input.reviewedInputs!==true)throw Error('請確認已覆核輸入、空白選填規則及排班結果。');
  const token=Utilities.getUuid(),draft={month,mode,plan:result.plan,fingerprint:snap.fingerprint,engine:AUTO_ENGINE_VERSION_};const json=JSON.stringify(draft);
  if(Utilities.newBlob(json).getBytes().length>95000)throw Error('預覽資料超過安全保存大小。');
  CacheService.getUserCache().put('auto:'+token,json,1200);result.token=token;result.expiresInMinutes=20;
 }
 result.missingDemandCount=(p.issues||[]).filter(x=>x.sheet==='DailyShiftDemands'&&x.message.includes('待填')).length;
 result.issueCount=(result.issues||[]).length;return result;
}
function publishAutoSchedule(input){
 const actor=autoAdmin_();if(!input||input.confirmed!==true||!/^[-\w]{20,80}$/.test(input.token||''))throw Error('請先產生預覽並確認發布。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後再試。');
 try{
  autoAdmin_();const cache=CacheService.getUserCache(),key='auto:'+input.token,json=cache.get(key);if(!json)throw Error('預覽已到期或已送出；請重新讀取，勿重複送出。');
  const draft=JSON.parse(json),snap=autoSnapshot_(draft.month,draft.mode);
  if(draft.engine!==AUTO_ENGINE_VERSION_||snap.fingerprint!==draft.fingerprint)throw Error('Sheet 已變更，舊預覽不能覆蓋新資料。請重新產生排班。');
  const p=autoPrepare_(snap.input),v=autoValidatePlan_(p,draft.plan);if(!v.ok)throw Error('發布前驗證未通過：'+v.errors.slice(0,5).join('；'));
  const test=draft.mode==='acceptance',name=test?'自動排班驗收':'月班表',sheet=snap.map[name],raw=snap.raw[name]||[],requests=[],targets=[],additionalReadback=[],version='AUTO-'+input.token,time=new Date().toISOString();
  const id=sheet?sheet.sheetId:Math.floor(Math.random()*1000000000)+1000000000;
  if(!sheet){requests.push({addSheet:{properties:{sheetId:id,title:name,gridProperties:{rowCount:1000,columnCount:36,frozenRowCount:1}}}});requests.push({updateCells:{start:{sheetId:id,rowIndex:0,columnIndex:0},rows:[{values:AUTO_MONTH_HEADER_.map(cellValue)}],fields:'userEnteredValue'}});}
  let next=Math.max(1,raw.length);
  const formula=sheet?readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'"+name+"'!A1:AJ"+Math.min(sheet.gridProperties.rowCount,1001),{valueRenderOption:'FORMULA'})).values||[]:[];
  for(const e of p.employees){const matches=raw.map((r,i)=>({r,i})).filter(x=>x.r[0]===draft.month&&x.r[1]===e.employeeId);if(matches.length>1)throw Error('同月員工班表重複。');const row=matches.length?matches[0].i:next++;if(row>=1000)throw Error('班表資料已達上限。');if(formula[row]?.some(v=>typeof v==='string'&&v.startsWith('=')))throw Error('目標班表包含公式，停止覆寫。');const stat=v.stats.find(x=>x.id===e.employeeId),values=[draft.month,e.employeeId,e.displayName,...p.dates.map(d=>draft.plan[e.employeeId][d]),...Array(31-p.dates.length).fill(''),stat.hours,(test?'驗收資料｜':'自動排班已確認｜')+version];targets.push({row,values});}
  if(sheet){const backupId=Math.floor(Math.random()*1000000000),title=(test?'驗收備份_':'排班前備份_')+draft.month+'_'+input.token.slice(0,8);requests.push({duplicateSheet:{sourceSheetId:id,newSheetId:backupId,newSheetName:title}});if(next>sheet.gridProperties.rowCount)requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:next-sheet.gridProperties.rowCount}});}
  targets.forEach(t=>requests.push({updateCells:{start:{sheetId:id,rowIndex:t.row,columnIndex:0},rows:[{values:t.values.map(cellValue)}],fields:'userEnteredValue'}}));
  if(!test){
   const append=(name,records)=>{const dest=snap.map[name],fields=AUTO_FIELDS_[name],start=snap.raw[name].length;if(start+records.length>1000)throw Error(name+' 紀錄即將超過讀取上限，請先封存。');if(start+records.length>dest.gridProperties.rowCount)requests.push({appendDimension:{sheetId:dest.sheetId,dimension:'ROWS',length:start+records.length-dest.gridProperties.rowCount}});const values=records.map(r=>fields.map(k=>r[k]??''));requests.push({updateCells:{start:{sheetId:dest.sheetId,rowIndex:start,columnIndex:0},rows:values.map(r=>({values:r.map(cellValue)})),fields:'userEnteredValue'}});additionalReadback.push({range:"'"+dest.title+"'!A"+(start+1)+':'+String.fromCharCode(64+fields.length)+(start+records.length),values});};
   append('ScheduleVersions',[{scheduleVersionId:version,yearMonth:draft.month,sequence:(snap.input.tables.ScheduleVersions||[]).filter(r=>r.yearMonth===draft.month).length+1,status:'PUBLISHED',createdBy:actor.email,createdAt:time,publishedAt:time,inputVersionHash:snap.fingerprint,validationStatus:'PASSED_ENTERED_CONSTRAINTS',version:1}]);
   const assignments=[];for(const e of p.employees)for(const d of p.dates)for(const s of draft.plan[e.employeeId][d]){const shift=p.shifts[s],iso=minutes=>new Date(autoDay_(d)*86400000+minutes*60000).toISOString().slice(0,19)+'+08:00';assignments.push({assignmentId:version+'-'+e.employeeId+'-'+d+'-'+s,scheduleVersionId:version,employeeId:e.employeeId,date:d,shiftId:s,startAt:iso(shift.start),endAt:iso(shift.end),calculatedWorkMinutes:shift.minutes,status:'PUBLISHED',version:1});}if(assignments.length)append('ScheduleAssignments',assignments);
   append('AuditLogs',[{auditId:Utilities.getUuid(),actorId:actor.email,action:'AUTO_SCHEDULE_PUBLISH',targetId:version,timestamp:time,requestId:input.token,resultStatus:'COMMITTED',clientVersion:AUTO_ENGINE_VERSION_,metadataSafe:JSON.stringify({month:draft.month,employees:p.employees.length})}]);
   const demandFormula=snap.demandUpdates.length?readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'"+snap.map.DailyShiftDemands.title+"'!A1:H1000",{valueRenderOption:'FORMULA'})).values||[]:[];
   for(const change of snap.demandUpdates){const fields=autoFields_('DailyShiftDemands'),column=fields.indexOf(change.key),old=demandFormula[change.row-1]?.[column];if(typeof old==='string'&&old.startsWith('='))throw Error('需求儲存格含公式，停止套用待填表。');requests.push({updateCells:{start:{sheetId:snap.map.DailyShiftDemands.sheetId,rowIndex:change.row-1,columnIndex:column},rows:[{values:[cellValue(change.value)]}],fields:'userEnteredValue'}});const a1=String.fromCharCode(65+column)+change.row;additionalReadback.push({range:"'"+snap.map.DailyShiftDemands.title+"'!"+a1+':'+a1,values:[[change.value]]});}
   const activeRows=snap.raw['排班控制'].map((r,i)=>({r,i})).filter(x=>x.r[0]==='ACTIVE_SCHEDULE_VERSION');if(activeRows.length!==1)throw Error('目前班表版本控制欄位缺漏或重複。');const ar=activeRows[0].i;requests.push({updateCells:{start:{sheetId:snap.map['排班控制'].sheetId,rowIndex:ar,columnIndex:2},rows:[{values:[cellValue(version)]}],fields:'userEnteredValue'}});additionalReadback.push({range:"'排班控制'!C"+(ar+1)+':C'+(ar+1),values:[[version]]});
  }
  if(autoSnapshot_(draft.month,draft.mode).fingerprint!==snap.fingerprint)throw Error('送出前資料已變更，請重新預覽。');
  cache.remove(key); // Never replay a write after an uncertain network outcome.
  Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const readback=readSheets_(()=>Sheets.Spreadsheets.Values.batchGet(ACCESS_SHEET_ID,{ranges:targets.map(t=>"'"+name+"'!A"+(t.row+1)+':AJ'+(t.row+1)),valueRenderOption:'UNFORMATTED_VALUE'}));
  if(readback.valueRanges.length!==targets.length||targets.some((t,i)=>t.values.some((x,j)=>x!==(readback.valueRanges[i].values?.[0]?.[j]??''))))throw Error('寫入後核對未完成，請重新開啟 Sheet 確認，勿直接重送。');
  if(additionalReadback.length){const extra=readSheets_(()=>Sheets.Spreadsheets.Values.batchGet(ACCESS_SHEET_ID,{ranges:additionalReadback.map(r=>r.range),valueRenderOption:'UNFORMATTED_VALUE'}));if(extra.valueRanges.length!==additionalReadback.length||additionalReadback.some((r,i)=>r.values.some((row,j)=>row.some((v,k)=>v!==(extra.valueRanges[i].values?.[j]?.[k]??'')))))throw Error('版本、需求或明細寫後核對未完成；請開啟 Sheet 確認，勿直接重送。');}
  return {status:'VERIFIED',version,month:draft.month,mode:draft.mode,employeeCount:targets.length,hours:v.stats.reduce((n,e)=>n+e.hours,0),sheetUrl:'https://docs.google.com/spreadsheets/d/'+ACCESS_SHEET_ID+'/edit#gid='+id};
 }finally{lock.releaseLock();}
}


