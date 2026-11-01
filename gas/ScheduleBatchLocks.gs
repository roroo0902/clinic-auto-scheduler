// Validate every selected day before issuing one atomic Sheets batch update.
function saveScheduleDayLocks(input){
 const member=requireMember_();if(member.role!=='管理者')throw Error('僅管理者可以鎖定或解除班次。');
 if(!input||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||typeof input.locked!=='boolean'||!Array.isArray(input.items)||!input.items.length||input.items.length>1000)throw Error('請選取 1 至 1000 個員工日期。');
 const mutex=LockService.getScriptLock();if(!mutex.tryLock(10000))throw Error('有人正在儲存，請稍後重新讀取。');
 try{
  const schedule=getSchedule({month:input.month,view:'all'}),rows=dayLockRows_(),seen=new Set();
  if(!schedule.canEdit)throw Error('僅管理者可以鎖定或解除班次。');
  for(const item of input.items){
   if(!item||!Number.isInteger(item.day)||typeof item.employeeId!=='string'||typeof item.fingerprint!=='string')throw Error('選取日期資料不正確。');
   const e=schedule.employees.find(e=>e.id===item.employeeId),key=JSON.stringify([item.employeeId,item.day]);
   if(seen.has(key))throw Error('選取日期重複。');seen.add(key);
   if(!e||item.day<1||item.day>schedule.dayCount||e.days[item.day-1]!==item.before)throw Error('選取班表已變更，整批尚未儲存，請重新讀取。');
   const date=input.month+'-'+String(item.day).padStart(2,'0');
   if(dayLockFingerprint_(rows,e.id,date)!==item.fingerprint)throw Error('選取鎖定狀態已變更，整批尚未儲存，請重新讀取。');
  }
  let planned=rows;const indices=new Set(),stamp=new Date().toISOString();
  for(const item of input.items){const plan=dayLockPlan_(planned,{employeeId:item.employeeId,date:input.month+'-'+String(item.day).padStart(2,'0'),locked:input.locked},member.email,stamp);planned=plan.rows;plan.indices.forEach(i=>indices.add(i));}
  const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'})),sheet=meta.sheets.find(s=>s.properties.title==='排班鎖定設定');
  if(!sheet)throw Error('找不到班次鎖定工作表。');
  const requests=[];
  if(planned.length>sheet.properties.gridProperties.rowCount)requests.push({appendDimension:{sheetId:sheet.properties.sheetId,dimension:'ROWS',length:planned.length-sheet.properties.gridProperties.rowCount}});
  // Combine adjacent rows to keep large selections within a compact request.
  const ordered=[...indices].sort((a,b)=>a-b);
  for(let n=0;n<ordered.length;){const start=ordered[n],values=[];let i=start;do{values.push({values:planned[i].map(cellValue)});n++;i++;}while(n<ordered.length&&ordered[n]===i);requests.push({updateCells:{start:{sheetId:sheet.properties.sheetId,rowIndex:start,columnIndex:0},rows:values,fields:'userEnteredValue'}});}
  if(requests.length)Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const verified=dayLockRows_();
  if(ordered.some(i=>JSON.stringify(Array.from({length:9},(_,j)=>verified[i]?.[j]??''))!==JSON.stringify(planned[i])))throw Error('已送出但批次核對未完成，請重新讀取，勿重複送出。');
  const result=getSchedule({month:input.month,view:input.view==='personal'?'personal':'all',employeeId:input.employeeId});
  for(const item of input.items){const e=schedule.employees.find(e=>e.id===item.employeeId),date=input.month+'-'+String(item.day).padStart(2,'0'),active=dayLocksFor_(verified,e.id,date);if(input.locked?!['A','B','C'].every(c=>active.some(r=>r[3]===c)):active.length>0)throw Error('批次核對未完成，請重新讀取。');}
  return {ok:true,count:input.items.length,schedule:result};
 }finally{mutex.releaseLock();}
}
