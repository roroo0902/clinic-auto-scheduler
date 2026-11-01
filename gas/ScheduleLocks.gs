// Whole-day locks use the existing AssignmentLocks schema: A/B/C all fixed,
// including shifts absent from the baseline. No schedule cells are changed.
const DAY_LOCK_HEADERS_=['鎖定代碼','員工代碼','日期','班別','鎖定','鎖定者','鎖定時間','原因','版本'];
function dayLockRows_(){
 const rows=readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'排班鎖定設定'!A1:I20001",{valueRenderOption:'UNFORMATTED_VALUE'})).values||[];
 if(rows.length>20000)throw Error('班次鎖定已達資料上限，請聯絡管理者封存歷史資料。');
 if(JSON.stringify(rows[0])!==JSON.stringify(DAY_LOCK_HEADERS_))throw Error('班次鎖定欄位不符，請聯絡管理者。');
 return rows;
}
function dayLocksFor_(rows,id,date){return rows.slice(1).filter(r=>r[1]===id&&r[2]===date&&r[4]===true);}
function dayLockFingerprint_(rows,id,date){
 return JSON.stringify(rows.slice(1).map((r,i)=>({row:i+1,values:Array.from({length:9},(_,j)=>r[j]??'')})).filter(x=>x.values[1]===id&&x.values[2]===date));
}
function dayLockDecorate_(schedule){
 const rows=dayLockRows_();
 for(const e of schedule.employees)e.dayLocks=e.days.map((s,i)=>{
  const date=schedule.month+'-'+String(i+1).padStart(2,'0'),active=dayLocksFor_(rows,e.id,date);
  return {locked:active.length>0,full:['A','B','C'].every(c=>active.some(r=>r[3]===c)),fingerprint:schedule.canEdit?dayLockFingerprint_(rows,e.id,date):''};
 });
 return schedule;
}
function dayLockAssertEditable_(employee,day){if(employee.dayLocks?.[day-1]?.locked)throw Error('這一天已鎖定，請先在班表解除鎖定再修改班別。');}
function dayLockPlan_(rows,input,actor,stamp){
 const planned=rows.map(r=>Array.from({length:9},(_,i)=>r[i]??'')),changes=[];
 for(let i=1;i<planned.length;i++)if(planned[i][1]===input.employeeId&&planned[i][2]===input.date&&planned[i][4]===true){
  planned[i][4]=false;planned[i][5]=actor;planned[i][6]=stamp;planned[i][7]='班表解除當日鎖定';planned[i][8]=String(stamp);changes.push(i);
 }
 if(input.locked)for(const shift of ['A','B','C']){
  let i=planned.findIndex((r,j)=>j>0&&r[1]===input.employeeId&&r[2]===input.date&&r[3]===shift);
  if(i<1){i=planned.findIndex((r,j)=>j>0&&r.every((v,k)=>v===''||k===4&&v===false));if(i<1)i=planned.length;}
  planned[i]=['DAY-'+input.employeeId+'-'+input.date+'-'+shift,input.employeeId,input.date,shift,true,actor,stamp,'班表鎖定當日（包含未排班）',String(stamp)];
  changes.push(i);
 }
 if(planned.length>20000)throw Error('班次鎖定已達資料上限，請聯絡管理者封存歷史資料。');
 return {rows:planned,indices:[...new Set(changes)]};
}
function saveScheduleDayLock(input){
 const member=requireMember_();if(member.role!=='管理者')throw Error('僅管理者可以鎖定或解除班次。');
 if(!input||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||!Number.isInteger(input.day)||typeof input.locked!=='boolean'||typeof input.fingerprint!=='string')throw Error('鎖定資料不正確。');
 const mutex=LockService.getScriptLock();if(!mutex.tryLock(10000))throw Error('有人正在儲存，請稍後重新讀取。');
 try{
  const schedule=getSchedule({month:input.month,view:'all'}),e=schedule.employees.find(e=>e.id===input.employeeId);
  if(!schedule.canEdit)throw Error('僅管理者可以鎖定或解除班次。');
  if(!e||input.day<1||input.day>schedule.dayCount||e.days[input.day-1]!==input.before)throw Error('班表已變更，請重新讀取後再操作。');
  const date=input.month+'-'+String(input.day).padStart(2,'0'),rows=dayLockRows_();
  if(dayLockFingerprint_(rows,e.id,date)!==input.fingerprint)throw Error('鎖定狀態已變更，請重新讀取。');
  const stamp=new Date().toISOString(),plan=dayLockPlan_(rows,{employeeId:e.id,date,locked:input.locked},member.email,stamp);
  const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'})),sheet=meta.sheets.find(s=>s.properties.title==='排班鎖定設定');
  if(!sheet)throw Error('找不到班次鎖定工作表。');
  const requests=[];if(plan.rows.length>sheet.properties.gridProperties.rowCount)requests.push({appendDimension:{sheetId:sheet.properties.sheetId,dimension:'ROWS',length:plan.rows.length-sheet.properties.gridProperties.rowCount}});
  for(const i of plan.indices)requests.push({updateCells:{start:{sheetId:sheet.properties.sheetId,rowIndex:i,columnIndex:0},rows:[{values:plan.rows[i].map(cellValue)}],fields:'userEnteredValue'}});
  if(requests.length)Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const verified=dayLockRows_();
  if(plan.indices.some(i=>JSON.stringify(Array.from({length:9},(_,j)=>verified[i]?.[j]??''))!==JSON.stringify(plan.rows[i])))throw Error('已送出但鎖定核對未完成，請重新讀取，勿重複送出。');
  const result=getSchedule({month:input.month,view:input.view==='personal'?'personal':'all',employeeId:e.id}),after=result.employees.find(x=>x.id===e.id),state=after?.dayLocks[input.day-1];
  if(!after||after.days[input.day-1]!==input.before||state.locked!==input.locked||input.locked&&!state.full)throw Error('儲存後核對未完成，請重新讀取。');
  return {ok:true,schedule:result};
 }finally{mutex.releaseLock();}
}
