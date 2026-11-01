// Merge only into the latest complete cloud export; fail on unexpected hooks.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function merge(source){
 if(source.includes('function saveScheduleDayLock('))throw Error('來源已包含班表鎖定，請勿重複合併');
 const portal=source.split(/\r?\n/).filter(l=>l.startsWith('const PORTAL_HTML_ = '));if(portal.length!==1)throw Error('PORTAL_HTML_ 必須唯一');
 let html=JSON.parse(portal[0].slice('const PORTAL_HTML_ = '.length).replace(/;\s*$/,''));
 function replace(text,a,b){if(text.split(a).length!==2)throw Error('合併位置不唯一：'+a.slice(0,90));return text.replace(a,b);}
 html=replace(html,'async function formLoad(name){',"async function formLoad(name){\n if(name==='AssignmentLocks'||name==='排班鎖定設定'){formDialog.close();return openSchedule('all');}");
 html=replace(html,"shift.value=e.days[n-1];current.textContent=", "shift.value=e.days[n-1];shift.disabled=submit.disabled=!!e.dayLocks?.[n-1]?.locked;current.textContent=");
 html=replace(html,"+' · 目前班別：'+", "+(e.dayLocks?.[n-1]?.locked?' · 🔒 已鎖定，請先解除鎖定':'')+' · 目前班別：'+");
 html=replace(html,'</body>',fs.readFileSync(path.join(__dirname,'../gas/ScheduleLocks.html'),'utf8')+'\n</body>');
 source=replace(source,portal[0],'const PORTAL_HTML_ = '+JSON.stringify(html)+';');
 source=replace(source,'function getSchedule(input) {','function getScheduleCoreWithoutLocks_(input) {');
 source=replace(source,"const rows=scheduleRows_('月班表','AJ'),index=rows.findIndex(r=>r[0]===input.month&&r[1]===input.employeeId);", "dayLockAssertEditable_(employee,input.day);\n  const rows=scheduleRows_('月班表','AJ'),index=rows.findIndex(r=>r[0]===input.month&&r[1]===input.employeeId);");
 // The old suggestion engine incorrectly rejected absent shifts protected by locks.
 const absent=source.split(/\r?\n/).filter(l=>l.includes("for(const r of locks)if(r['班別']&&!")&&l.includes('鎖定班別與現有班表不符'));
 if(absent.length!==1)throw Error('找不到智慧建議鎖定檢查');source=source.replace(absent[0],' // Locks preserve baseline presence AND absence; fixed[] below enforces the whole day.');
 const editLine=source.split(/\r?\n/).find(l=>l.startsWith('const editableSheets = '));if(!editLine||!editLine.includes("'AssignmentLocks'"))throw Error('找不到舊版鎖定編輯權限');
 source=source.replace(/^const editableSheets = .*$/m,editLine.replace(",'AssignmentLocks'",''));
 source=replace(source,'Math.min(1001,p.gridProperties.rowCount));',"Math.min(p.title==='排班鎖定設定'?20001:1001,p.gridProperties.rowCount));");
 source=replace(source,"if(values.length>=1000)throw Error(sheets[i].title+", "if(values.length>=(sheets[i].title==='排班鎖定設定'?20001:1000))throw Error(sheets[i].title+");
 source=replace(source,'Math.min(1001,map[n].gridProperties.rowCount));',"Math.min(n==='AssignmentLocks'?20001:1001,map[n].gridProperties.rowCount));");
 source=replace(source,"if(raw[n].length>=1001)throw Error(n+", "if(raw[n].length>=(n==='AssignmentLocks'?20001:1001))throw Error(n+");
 source+='\nfunction getSchedule(input){return dayLockDecorate_(getScheduleCoreWithoutLocks_(input));}\n'+fs.readFileSync(path.join(__dirname,'../gas/ScheduleLocks.gs'),'utf8');
 new vm.Script(source);for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);return source;
}
module.exports={merge};
if(require.main===module){const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('請指定最新雲端來源與輸出檔');fs.writeFileSync(output,merge(fs.readFileSync(input,'utf8')));console.log('已合併班表鎖定，語法檢查通過');}
