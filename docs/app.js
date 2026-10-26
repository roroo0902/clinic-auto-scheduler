const $=id=>document.getElementById(id);
const key='clinic-scheduler-private-sheet-v1';
let sheetUrl='';
function normalizeSheetUrl(value){
 try{const u=new URL(value);const match=u.pathname.match(/^\/spreadsheets\/d\/([A-Za-z0-9_-]+)(?:\/|$)/);return u.protocol==='https:'&&u.hostname==='docs.google.com'&&match?'https://docs.google.com/spreadsheets/d/'+match[1]+'/edit':null;}catch{return null;}
}
try{sheetUrl=normalizeSheetUrl(localStorage.getItem(key))||'';}catch{}
function updateStatus(){$('connection').textContent=sheetUrl?'私人試算表入口已設定 · 尚未自動同步':'尚未設定私人試算表入口';}
function setup(){$('sheet-url').value=sheetUrl;$('config-error').textContent='';$('config').showModal();}
function openSheet(){if(sheetUrl)window.open(sheetUrl,'_blank','noopener,noreferrer');else setup();}
function sheetButton(text){const b=document.createElement('button');b.className='action';b.textContent=text;b.addEventListener('click',openSheet);return b;}
const content={
 new:{title:'新增角色',html:'<p>在私人試算表的 <b>Employees</b> 分頁，為夥伴填寫姓名、任職類型與工時條件。已預留 EMP001–EMP010。</p><p>第一列欄名供程式使用，請保留。尚未確認的限制先留白。</p>',label:'開啟試算表，新增員工'},
 roles:{title:'角色設定',html:'<p>到以下分頁調整員工條件：</p><ul><li><b>Employees</b>：工時目標、出勤與休息限制</li><li><b>EmployeeAvailability</b>：指定日期可排／不可排班別</li><li><b>RecurringAvailability</b>：每週固定可排時段</li><li><b>ForcedShifts</b>：指定班別，模式仍待確認</li><li><b>LeaveRequests</b>：請假與不可出勤日期</li></ul>',label:'開啟試算表，調整角色'},
 battle:{title:'開始開戰',html:'<p>本次戰役：<b>2026 年 11 月</b>。先在 <b>DailyShiftDemands</b> 填入每班需求與 MaxStaff，再補齊員工限制。</p><p>自動排班引擎尚未啟用。以下為空白預覽，不是已產生的排班結果。</p><button class="disabled" disabled>自動產生班表 · 待開發</button><div class="table-wrap"><table><thead><tr><th>日期</th><th>A 早班</th><th>B 午班</th><th>C 晚班</th></tr></thead><tbody id="month"></tbody></table></div>',label:'開啟 Schedule_W1初版'},
 other:{title:'其他',html:'<p><b>SystemConfig</b> 管理系統參數；<b>ShiftDefinitions</b> 管理早午晚班；<b>使用說明</b> 提供填寫順序。</p><div class="links"><a href="https://github.com/roroo0902/clinic-auto-scheduler" target="_blank" rel="noopener noreferrer">GitHub 原始碼 ↗</a><a href="https://github.com/roroo0902/clinic-auto-scheduler/blob/main/docs/data-guide.md" target="_blank" rel="noopener noreferrer">資料填寫指南 ↗</a></div>',label:'開啟參數試算表'}
};
document.querySelectorAll('[data-panel]').forEach(b=>b.addEventListener('click',()=>{
 const c=content[b.dataset.panel];$('panel-title').textContent=c.title;$('panel-content').innerHTML=c.html;
 if(b.dataset.panel==='battle')for(let day=1;day<=30;day++){const tr=document.createElement('tr');for(const value of ['11/'+String(day).padStart(2,'0'),'待排','待排','待排']){const td=document.createElement('td');td.textContent=value;tr.append(td);}$('month').append(tr);}
 $('panel-content').append(sheetButton(c.label));
 if(b.dataset.panel==='other'){const edit=document.createElement('button');edit.className='action secondary';edit.textContent='變更試算表入口';edit.addEventListener('click',setup);$('panel-content').append(edit);}
 $('panel').showModal();
}));
document.querySelectorAll('dialog .close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('settings').addEventListener('click',setup);
$('config-form').addEventListener('submit',e=>{e.preventDefault();const next=normalizeSheetUrl($('sheet-url').value.trim());if(!next){$('config-error').textContent='請輸入 https://docs.google.com/spreadsheets/d/ 開頭的試算表連結。';return;}sheetUrl=next;try{localStorage.setItem(key,next);}catch{$('config-error').textContent='瀏覽器無法保存設定，本次仍可使用入口。';updateStatus();return;}updateStatus();$('config').close();});
updateStatus();
