// Live schedules remain in Google Sheets; no employee data is bundled in GitHub.
function scheduleRows_(tab, end) {
 return Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'"+tab+"'!A1:"+end+'1001',{valueRenderOption:'UNFORMATTED_VALUE'}).values||[];
}
function getSchedule(input) {
 const member=requireMember_();
 input=input||{};
 const month=String(input.month||'2026-11'),view=input.view||'personal';
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!['personal','all'].includes(view))throw Error('請選擇正確月份與檢視方式。');
 const data=scheduleRows_('月班表','AJ');
 const expected=['年月','員工代碼','姓名',...Array.from({length:31},(_,i)=>String(i+1)),'總工時','資料狀態'];
 if(!data.length||expected.some((v,i)=>String(data[0][i])!==v)||data.length>1000)throw Error('班表格式不符，請聯絡管理者。');
 let employeeId='';
 if(view==='personal'){
  const bindings=scheduleRows_('帳號員工對照','B');
  if(!bindings.length||bindings[0][0]!=='Google 信箱'||bindings[0][1]!=='員工代碼')throw Error('帳號對照格式不符。');
  const found=bindings.slice(1).filter(r=>String(r[0]).trim().toLowerCase()===member.email);
  if(found.length!==1)throw Error('此帳號尚未對應個人班表，請切換整體班表或聯絡管理者。');
  employeeId=found[0][1];
 }
 const count=new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 const rows=data.slice(1).filter(r=>r[0]===month&&(view==='all'||r[1]===employeeId));
 if(new Set(rows.map(r=>r[1])).size!==rows.length)throw Error('同月員工班表重複，請聯絡管理者。');
 const standards=scheduleRows_('每月工時標準','C');
 const matching=standards.slice(1).filter(r=>r[0]===month);
 if(standards[0]?.join('|')!=='年月|本月上班天數|預期上班總時數'||matching.length>1)throw Error('每月工時標準格式不符。');
 const standard=matching.length&&matching[0][1]!=='待同步'&&matching[0][2]!=='待同步'?{workDays:matching[0][1],hours:matching[0][2]}:null;
 if(standard&&(!Number.isInteger(standard.workDays)||standard.workDays<0||standard.workDays>count||typeof standard.hours!=='number'||!Number.isFinite(standard.hours)||standard.hours<0))throw Error('每月工時標準不正確。');
 const availableMonths=[...new Set([...standards.slice(1),...data.slice(1)].map(r=>r[0]).filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort();
 return {month,view,availableMonths,dayCount:count,standard,canEdit:member.role==='管理者',employees:rows.map(r=>{
  const days=Array.from({length:count},(_,i)=>String(r[i+3]||''));
  if(days.some(s=>!['','A','B','C','AB','AC','BC','ABC'].includes(s)))throw Error('班別資料不正確。');
  const hours=days.reduce((n,s)=>n+[...s].reduce((a,c)=>a+({A:4,B:4,C:3}[c]),0),0);
  if(Number(r[34])!==hours)throw Error('班表工時核對不符。');
  return {id:r[1],name:r[2],days,hours,workDays:days.filter(Boolean).length,status:r[35]||''};
 })};
}

// Writes one employee/day and its total atomically. 月班表 is the live schedule.
function saveScheduleDay(input) {
 const member=requireMember_();if(member.role!=='管理者')throw Error('僅管理者可以登錄班別。');
 if(!input||!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)||!Number.isInteger(input.day)||!['','A','B','C','AB','AC','BC','ABC'].includes(input.shift))throw Error('班別登錄格式不正確。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後重試。');
 try {
  const schedule=getSchedule({month:input.month,view:'all'});
  if(input.day<1||input.day>schedule.dayCount)throw Error('日期超出本月份。');
  const employee=schedule.employees.find(e=>e.id===input.employeeId);
  if(!employee||employee.days[input.day-1]!==input.before)throw Error('班表已變更，請重新讀取後再修改。');
  const rows=scheduleRows_('月班表','AJ'),index=rows.findIndex(r=>r[0]===input.month&&r[1]===input.employeeId);
  employee.days[input.day-1]=input.shift;
  const hours=employee.days.reduce((n,s)=>n+[...s].reduce((a,c)=>a+({A:4,B:4,C:3}[c]),0),0);
  const meta=Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'});
  const sheet=meta.sheets.find(s=>s.properties.title==='月班表').properties.sheetId;
  const requests=[{updateCells:{start:{sheetId:sheet,rowIndex:index,columnIndex:input.day+2},rows:[{values:[cellValue(input.shift)]}],fields:'userEnteredValue'}},{updateCells:{start:{sheetId:sheet,rowIndex:index,columnIndex:34},rows:[{values:[cellValue(hours),cellValue('人工更新')]}],fields:'userEnteredValue'}}];
  Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const verified=getSchedule({month:input.month,view:'all'}).employees.find(e=>e.id===input.employeeId);
  if(!verified||verified.days[input.day-1]!==input.shift||verified.hours!==hours)throw Error('已送出但核對失敗，請重新讀取，勿重複送出。');
  return {ok:true};
 } finally {lock.releaseLock();}
}
function verifyMonthlySchedule() {
 if(requireMember_().role!=='管理者')throw Error('僅管理者可執行。');
 const s=getSchedule({month:'2026-11',view:'all'});
 console.log('月班表讀取通過：'+s.employees.length+' 人，'+s.employees.reduce((n,e)=>n+e.hours,0)+' 小時。');
}

// Administrator smoke test: writes the existing shift, verifies it, restores status.
function verifyScheduleWriteReadback() {
 if(requireMember_().role!=='管理者')throw Error('僅管理者可執行。');
 const data=getSchedule({month:'2026-11',view:'all'}),employee=data.employees[0];
 if(!employee)throw Error('沒有可測試的班表。');
 try {
  saveScheduleDay({month:data.month,employeeId:employee.id,day:1,before:employee.days[0],shift:employee.days[0]});
  const after=getSchedule({month:data.month,view:'all'}).employees.find(e=>e.id===employee.id);
  if(JSON.stringify(after.days)!==JSON.stringify(employee.days)||after.hours!==employee.hours)throw Error('核對不符。');
 } finally {
  const rows=scheduleRows_('月班表','AJ'),index=rows.findIndex(r=>r[0]===data.month&&r[1]===employee.id);
  const meta=Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'});
  const id=meta.sheets.find(s=>s.properties.title==='月班表').properties.sheetId;
  if(index>0)Sheets.Spreadsheets.batchUpdate({requests:[{updateCells:{start:{sheetId:id,rowIndex:index,columnIndex:35},rows:[{values:[cellValue(employee.status)]}],fields:'userEnteredValue'}}]},ACCESS_SHEET_ID);
 }
 console.log('班別寫入及讀回通過；原班次、總工時及資料狀態已保留。');
}
