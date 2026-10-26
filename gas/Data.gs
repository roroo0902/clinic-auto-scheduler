const FORM_NAMES_ = {
 Employees:'員工基本資料',EmployeeQualifications:'資格與技能',AllowedShifts:'允許班別',
 EmployeeAvailability:'指定日期可排時段',RecurringAvailability:'每週固定時段',ForcedShifts:'指定班別',
 EmployeePreferences:'排班偏好',LeaveRequests:'請假申請',個人假日設定:'個人假日',組合優先設定:'班別組合順位',班別優先人員:'班別優先人員',
 排班控制:'排班控制設定',DailyShiftDemands:'每日人力與人數上限',Schedule_W1初版:'當月班表',統計與檢查規則:'統計與檢查規則',
 參數設定索引:'參數設定索引',使用說明:'使用說明',ShiftDefinitions:'早午晚班時間',CalendarDates:'日曆與休診日',登入授權名單:'登入授權名單',SystemConfig:'系統參數'
};
const READONLY_FORMS_ = ['Schedule_W1初版','參數設定索引','使用說明'];
function stableFormJson_(value) {
 if(Array.isArray(value))return '['+value.map(stableFormJson_).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableFormJson_(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
function formPermission_(name, write) {
 const member=requireMember_();
 if(write&&member.role!=='管理者')throw Error('僅管理者可以修改設定；員工可查閱個人與整體班表。');
 if(!Object.prototype.hasOwnProperty.call(FORM_NAMES_,name)) throw Error('不支援的資料項目。');
 if(['登入授權名單','SystemConfig','統計與檢查規則','排班控制'].includes(name)&&member.role!=='管理者') throw Error('此項目僅限管理者使用。');
 if(write&&READONLY_FORMS_.includes(name))throw Error('此頁為查閱資料，不能上傳修改。');
 return member;
}
function snapshotForm_(name) {
 const meta=Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'});
 const properties=resolveFormSheet_(name,(meta.sheets||[]).map(s=>s.properties));
 if(!properties)throw Error('找不到資料分頁。');
 const n=Math.min(52,properties.gridProperties.columnCount),end=n<=26?String.fromCharCode(64+n):'A'+String.fromCharCode(64+n-26);
 const result=Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{ranges:["'"+properties.title.replace(/'/g,"''")+"'!A1:"+end+Math.min(1001,properties.gridProperties.rowCount)],includeGridData:true,fields:'sheets(properties,data(rowData(values(userEnteredValue,formattedValue,dataValidation))))'});
 const sheet=(result.sheets||[]).find(s=>s.properties.sheetId===properties.sheetId);
 if(!sheet)throw Error('找不到資料分頁。');
 const cells=sheet.data&&sheet.data[0]&&sheet.data[0].rowData||[];
 while(cells.length&&!(cells[cells.length-1].values||[]).some(c=>c.userEnteredValue))cells.pop();
 if(cells.length>1000)throw Error('資料超過網站目前支援的 1000 列，請聯絡管理者。');
 const first=cells[0]&&cells[0].values||[];
 const headers=canonicalFormHeaders_(name,first.map(c=>String(c.userEnteredValue&&c.userEnteredValue.stringValue||c.formattedValue||'')));
 while(headers.length&&!headers[headers.length-1])headers.pop();
 if(!headers.length||headers.some(h=>!h)||new Set(headers).size!==headers.length)throw Error('欄位名稱空白或重複，無法安全編輯。');
 if(sheet.properties.gridProperties.columnCount>52)throw Error('資料欄位超過網站支援範圍。');
 const fingerprint=Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,stableFormJson_(cells)));
 const rows=cells.slice(1).map((r,i)=>({row:i+1,cells:headers.map((_,j)=>{
  const c=(r.values||[])[j]||{},u=c.userEnteredValue||{};
  return {value:u.stringValue!==undefined?u.stringValue:u.numberValue!==undefined?u.numberValue:u.boolValue!==undefined?u.boolValue:'',display:c.formattedValue||'',formula:!!u.formulaValue,validation:c.dataValidation||null};
 })}));
 return {name,title:FORM_NAMES_[name],headers,rows,fingerprint,sheetId:sheet.properties.sheetId,rowCount:sheet.properties.gridProperties.rowCount,readOnly:READONLY_FORMS_.includes(name)};
}
function getFormData(name){formPermission_(name,false);return snapshotForm_(name);}
function checkedValues_(data,row,values){
 if(!Array.isArray(values)||values.length!==data.headers.length)throw Error('欄位數量不符，請重新讀取。');
 const before=row<0?null:data.rows.find(r=>r.row===row);
 if(row>=0&&!before)throw Error('原資料已不存在。');
 const clean=values.map((v,i)=>{
  if(!['string','boolean','number'].includes(typeof v)||(typeof v==='number'&&!Number.isFinite(v))||String(v).length>4000)throw Error('欄位資料格式不正確。');
  const cell=before?before.cells[i]:data.rows[0]&&data.rows[0].cells[i];
  if(cell&&cell.formula){if(row<0||v!==cell.value)throw Error('公式欄位不可修改；新增含公式資料請聯絡管理者。');return v;}
  if(before&&v===before.cells[i].value)return v;
  const condition=cell&&cell.validation&&cell.validation.condition;
  if(condition&&v!==''){
   const type=condition.type,opts=(condition.values||[]).map(x=>x.userEnteredValue);
   if(type==='ONE_OF_LIST'){if(!opts.includes(String(v)))throw Error(data.headers[i]+'不在允許選項中。');}
   else if(type==='BOOLEAN'){if(typeof v!=='boolean')throw Error('請選擇啟用或停用。');}
   else throw Error(data.headers[i]+'具有進階試算表驗證，請由管理者確認後處理。');
  }
  const parsed=(typeof v==='boolean'&&!booleans.has(data.headers[i]))||(typeof v==='number'&&!isNumber(data.headers[i]))?v:parseInput(data.headers[i],String(v));
  if(parsed!==v)throw Error(data.headers[i]+'的資料類型不正確。');
  return v;
 });
 if(before&&clean[0]!==before.cells[0].value)throw Error('既有識別代碼不可修改。');
 validateRecord(data.headers,clean,data.name);
 if(data.name==='登入授權名單'){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean[0])||!['管理者','一般使用者'].includes(clean[2])||typeof clean[3]!=='boolean')throw Error('授權名單格式不正確。');
  const own=Session.getActiveUser().getEmail().toLowerCase();
  if(String(clean[0]).toLowerCase()===own&&(clean[2]!=='管理者'||clean[3]!==true))throw Error('不能在此停用或降級目前登入的管理者。');
 }
 const unique=['Employees','EmployeePreferences','EmployeeAvailability','RecurringAvailability','ForcedShifts','LeaveRequests','DailyShiftDemands','ShiftDefinitions','CalendarDates','登入授權名單'];
 if(unique.includes(data.name)&&data.rows.some(r=>r.row!==row&&String(r.cells[0].value).trim().toLowerCase()===String(clean[0]).trim().toLowerCase()))throw Error('此識別代碼或帳號已存在。');
 return clean;
}
function saveFormData(input){
 if(!input||typeof input.name!=='string'||!Number.isInteger(input.row)||input.row===0||input.row< -1)throw Error('儲存請求不正確。');
 formPermission_(input.name,true);
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('其他人正在儲存，請稍後重新預覽。');
 try{
  formPermission_(input.name,true);
  const data=snapshotForm_(input.name);
  if(input.fingerprint!==data.fingerprint)throw Error('試算表已被修改。請保留草稿，重新讀取後再預覽，避免覆蓋他人資料。');
  const clean=checkedValues_(data,input.row,input.values),before=data.rows.find(r=>r.row===input.row);
  const row=input.row<0?data.rows.length+1:input.row;
  if(row>=1000)throw Error('已達網站支援的資料列數，請聯絡管理者。');
  const diff=data.headers.flatMap((_,i)=>!before||clean[i]!==before.cells[i].value?[{index:i,value:clean[i]}]:[]);
  if(!diff.length)throw Error('沒有需要上傳的變更。');
  const requests=[];
  if(row>=data.rowCount)requests.push({appendDimension:{sheetId:data.sheetId,dimension:'ROWS',length:row-data.rowCount+1}});
  for(const d of diff)requests.push({updateCells:{start:{sheetId:data.sheetId,rowIndex:row,columnIndex:d.index},rows:[{values:[cellValue(d.value)]}],fields:'userEnteredValue'}});
  Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const verify=snapshotForm_(input.name),saved=verify.rows.find(r=>r.row===row);
  if(!saved||diff.some(d=>saved.cells[d.index].value!==d.value))throw Error('寫入已送出但讀回不符，請重新讀取確認，勿重複上傳。');
  return {ok:true,row:row+1};
 }finally{lock.releaseLock();}
}


// Chinese tab and header aliases keep the existing form API and validation keys stable.
const CHINESE_SHEET_TITLES_ = {"Schedule_W1初版":"班表初版","SystemConfig":"系統參數","Employees":"員工基本資料","ShiftDefinitions":"班別時間設定","CalendarDates":"日曆設定","DailyShiftDemands":"每日班別人力需求","ShiftQualificationDemands":"班別資格需求","EmployeeQualifications":"員工資格與技能","EmployeePreferences":"員工排班偏好","EmployeeAvailability":"指定日期可排時段","RecurringAvailability":"每週固定可排時段","LeaveRequests":"請假申請","PairingRules":"員工搭班規則","ShiftTransitions":"班別銜接規則","ScheduleVersions":"班表版本紀錄","ScheduleAssignments":"班表排班明細","AssignmentLocks":"排班鎖定設定","SchedulingTasks":"排班任務","TaskCheckpoints":"任務續算紀錄","TaskEvents":"任務事件紀錄","ValidationReports":"驗證報告","ChangeLogs":"變更紀錄","AuditLogs":"操作稽核紀錄","Notifications":"通知紀錄","AlgorithmComparisons":"排班演算法比較","Backups":"備份紀錄","DeploymentHistory":"部署紀錄","ForcedShifts":"指定班別","CrossMonthCoverage":"跨月資料完整性","EmployeeSettingsHistory":"員工設定歷程","LegalPolicy":"法規政策設定","AllowedShifts":"允許班別組合"};
const CHINESE_FORM_COLUMNS_ = {"SystemConfig":"key,value,type,scope,effectiveFrom,effectiveTo,version,status","Employees":"employeeId,displayName,active,department,employmentType,targetMonthlyHours,minMonthlyRestDays,maxMonthlyWorkDays,maxDailyHours,maxWeeklyHours,maxConsecutiveDays,preferredMinDailyHours,validFrom,validTo,version,maxWeeklyWorkDays,minWeeklyShifts,maxWeeklyShifts,maxMonthlyHours,maxDailyShifts,targetMonthlyWorkDays,minWeeklyHours,minRestHours","ShiftDefinitions":"shiftId,shiftName,startTime,endTime,endDayOffset,unpaidBreakMinutes,breakRules,hoursCalculationPolicy,effectiveFrom,effectiveTo,version","CalendarDates":"date,weekday,isOperatingDay,isNationalHoliday,weekendFlag,holidayType,notes,calendarVersion","DailyShiftDemands":"demandId,date,shiftId,requiredHeadcount,MaxStaff,version,idealHeadcount,isClosed","EmployeeQualifications":"employeeId,qualificationId,qualificationName,roleCategory,verifiedForLegalDuty,verificationSourceRef,verificationAsOf,validFrom,validTo,version","EmployeePreferences":"preferenceId,employeeId,preferenceType,shiftId,dayOfWeek,holidayType,rankOrPreference,validFrom,validTo,version","EmployeeAvailability":"availabilityId,employeeId,date,shiftId,conditionType,isHard,source,approvalStatus,validFrom,validTo,version","RecurringAvailability":"recurringId,employeeId,weekday,shiftId,conditionType,isHard,validFrom,validTo,version","LeaveRequests":"requestId,employeeId,startDate,endDate,requestedShifts,status,reasonRef,reviewedBy,reviewedAt,version","ForcedShifts":"forcedShiftId,employeeId,date,shiftId,source,validFrom,validTo,version","AllowedShifts":"employeeId,combination,allowed,validFrom,validTo,notes","組合優先設定":"employeeId,combination,mode,priority,maxPerWeek,date,validFrom,validTo,notes","班別優先人員":"date,weekday,shiftId,employeeId,priority,allowOutsideList,validFrom,validTo,notes","個人假日設定":"employeeId,date,dayType,schedulePolicy,notes","登入授權名單":"Google 信箱,顯示名稱,角色,啟用,備註"};
function resolveFormSheet_(name, properties) {
 const candidates=properties.filter(p=>p.title===name||p.title===CHINESE_SHEET_TITLES_[name]);
 if(candidates.length!==1)throw Error(candidates.length?'資料分頁名稱重複，請聯絡管理者。':'找不到資料分頁。');
 return candidates[0];
}
function canonicalFormHeaders_(name, headers) {
 const keys=(CHINESE_FORM_COLUMNS_[name]||'').split(',');
 const extra={key:'參數代碼',value:'設定值',type:'資料類型',scope:'適用範圍'};
 return headers.map(header=>{
  const candidates=keys.filter(key=>key===header||(labels[key]||extra[key])===header);
  if(candidates.length>1)throw Error('欄位對照不明確，請聯絡管理者。');
  return candidates[0]||header;
 });
}

// Read-only administrator diagnostic; logs counts only, never employee or roster contents.
function verifyChineseCompatibility() {
 const member=requireMember_();
 if(member.role!=='管理者')throw Error('僅限管理者執行。');
 const names=Object.keys(FORM_NAMES_);
 for(const name of names){
  const data=getFormData(name);
  if(!data.headers.length)throw Error('缺少欄位：'+name);
 }
 console.log('中文分頁相容檢查通過：'+names.length+' 個網站資料項目；未修改任何資料。');
}
