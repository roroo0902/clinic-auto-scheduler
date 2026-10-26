const $=id=>document.getElementById(id);
const key='clinic-scheduler-private-sheet-v1';
const defaultSheetUrl="https://docs.google.com/spreadsheets/d/1yXezGllA3WtarKxIpWrVJmObqizbhnBAjub8cFMATiQ/edit";
const sheetIds={
  "Schedule_W1初版": 259096064,
  "使用說明": 1471042663,
  "SystemConfig": 1751427370,
  "Employees": 1543443974,
  "ShiftDefinitions": 766929081,
  "CalendarDates": 1017486508,
  "DailyShiftDemands": 170272222,
  "ShiftQualificationDemands": 1287069490,
  "EmployeeQualifications": 1961679238,
  "EmployeePreferences": 1464492961,
  "EmployeeAvailability": 1223699905,
  "RecurringAvailability": 1065581117,
  "LeaveRequests": 697474028,
  "PairingRules": 601628308,
  "ShiftTransitions": 100673703,
  "ScheduleVersions": 750139047,
  "ScheduleAssignments": 1861189735,
  "AssignmentLocks": 1147862550,
  "SchedulingTasks": 2068403592,
  "TaskCheckpoints": 912297759,
  "TaskEvents": 1512309528,
  "ValidationReports": 1012440896,
  "ChangeLogs": 1109366079,
  "AuditLogs": 1749441865,
  "Notifications": 1200519637,
  "AlgorithmComparisons": 1118209125,
  "Backups": 1041841127,
  "DeploymentHistory": 951310139,
  "ForcedShifts": 600820290,
  "CrossMonthCoverage": 1006851037,
  "EmployeeSettingsHistory": 1224797335,
  "LegalPolicy": 1496748634,
  "參數設定索引": 26010001,
  "排班控制": 26010002,
  "AllowedShifts": 26010003,
  "組合優先設定": 26010004,
  "班別優先人員": 26010005,
  "個人假日設定": 26010006,
  "統計與檢查規則": 26010007
};
let sheetUrl=defaultSheetUrl;
function normalizeSheetUrl(value){
 try{const u=new URL(value);const match=u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);return u.protocol==='https:'&&u.hostname==='docs.google.com'&&match?'https://docs.google.com/spreadsheets/d/'+match[1]+'/edit':null;}catch{return null;}
}
try{sheetUrl=normalizeSheetUrl(localStorage.getItem(key))||defaultSheetUrl;}catch{}
function sheetHref(name){
 if(sheetUrl===defaultSheetUrl&&Object.hasOwn(sheetIds,name))return sheetUrl+'#gid='+sheetIds[name];
 return sheetUrl+'#range='+encodeURIComponent("'"+name.replaceAll("'","''")+"'!A1");
}
function updateStatus(){$('connection').textContent=(sheetUrl===defaultSheetUrl?'瑞恩排班試算表':'自訂排班試算表')+' · 開啟需 Google 權限';}
function setup(){$('sheet-url').value=sheetUrl;$('config-error').textContent='';$('config').showModal();}
function sheetLink(label,name){
 const a=document.createElement('a');a.className='action secondary';a.textContent=label+' ↗';a.href=sheetHref(name);a.target='_blank';a.rel='noopener noreferrer';return a;
}
const content={
 new:{title:'召喚醫者',description:'締結新的輪值契約。在員工名冊填寫姓名、任職類型與工時條件；資格與可排班別可接著設定。',links:[['新增／編輯員工名冊','Employees'],['資格與技能','EmployeeQualifications'],['允許班別','AllowedShifts']]},
 roles:{title:'英靈編成',description:'為每位醫者設定出勤條件。請在試算表對應分頁修改，保留第一列欄名。',links:[['工時與出勤限制','Employees'],['允許班別','AllowedShifts'],['指定日期可排時段','EmployeeAvailability'],['每週固定可排時段','RecurringAvailability'],['強制班別','ForcedShifts'],['組合優先設定','組合優先設定'],['班別優先人員','班別優先人員'],['請假紀錄','LeaveRequests'],['個人假日設定','個人假日設定']]},
 battle:{title:'啟動命運之輪',description:'前往排班控制設定本次任務，確認每日需求與人數上限，再開啟當月班表。此網站提供試算表入口，尚未執行自動排班。',links:[['開啟排班控制','排班控制'],['每日需求與 MaxStaff','DailyShiftDemands'],['開啟當月班表','Schedule_W1初版'],['統計與檢查規則','統計與檢查規則']]},
 other:{title:'禁忌藏書閣',description:'查閱排班參數、班別與規則。修改實際資料時，由 Google 管理存取權限。',links:[['參數設定索引','參數設定索引'],['系統參數','SystemConfig'],['早午晚班時間','ShiftDefinitions'],['日曆與休診日','CalendarDates'],['政策設定','LegalPolicy'],['使用說明','使用說明']]}
};
function renderPanel(name){
 const c=content[name];$('panel-title').textContent=c.title;const area=$('panel-content');area.replaceChildren();
 const p=document.createElement('p');p.textContent=c.description;area.append(p);
 const links=document.createElement('div');links.className='sheet-links';for(const [label,target] of c.links)links.append(sheetLink(label,target));area.append(links);
 const note=document.createElement('p');note.className='hint';note.textContent='在新分頁開啟 Google Sheets；資料直接儲存在試算表，網站不會自動讀取或同步。';area.append(note);
 if(name==='other'){
  const a=document.createElement('a');a.href='https://github.com/roroo0902/clinic-auto-scheduler';a.textContent='GitHub 原始碼 ↗';a.target='_blank';a.rel='noopener noreferrer';a.className='action secondary';area.append(a);
  const edit=document.createElement('button');edit.className='action secondary';edit.textContent='變更試算表入口';edit.addEventListener('click',setup);area.append(edit);
 }
}
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{renderPanel(b.dataset.panel);$('panel').showModal();}));
document.querySelectorAll('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('settings').addEventListener('click',setup);
$('config-form').addEventListener('submit',e=>{
 e.preventDefault();const next=normalizeSheetUrl($('sheet-url').value.trim());
 if(!next){$('config-error').textContent='請輸入 https://docs.google.com/spreadsheets/d/ 開頭的試算表連結。';return;}
 sheetUrl=next;let saved=true;try{localStorage.setItem(key,next);}catch{saved=false;}
 updateStatus();if($('panel').open){const active=Object.keys(content).find(n=>content[n].title===$('panel-title').textContent);if(active)renderPanel(active);}
 if(saved)$('config').close();else $('config-error').textContent='瀏覽器無法保存設定，本次仍可使用入口。';
});
updateStatus();
