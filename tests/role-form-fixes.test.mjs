import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const code=['Model.gs','Data.gs'].map(f=>fs.readFileSync(new URL('../gas/'+f,import.meta.url),'utf8')).join('\n');
function setup(){
 const c={};vm.createContext(c);vm.runInContext(code,c);
 const data={name:'Employees',headers:['employeeId','displayName','targetMonthlyHours'],fingerprint:'before',sheetId:1,rowCount:1000,rows:[{row:1,cells:[{value:'EMP001'},{value:'Original'},{value:'',formula:true}]}]};
 let role='管理者',writes=0,requests=[];
 c.ACCESS_SHEET_ID='fixture';c.requireMember_=()=>({role});c.LockService={getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})};c.snapshotForm_=()=>data;
 c.Sheets={Spreadsheets:{batchUpdate:r=>{writes++;requests=r.requests;data.rows.push({row:2,cells:[{value:'QA'},{value:'Test'},{value:'',formula:true}]});}}};
 return {c,data,get writes(){return writes;},get requests(){return requests;},role:r=>role=r,input:()=>({name:'Employees',row:-1,values:['QA','Test',''],fingerprint:'before'})};
}
test('new staff atomically copies formula columns with native row-relative references',()=>{const t=setup();assert.equal(t.c.saveFormData(t.input()).row,3);assert.equal(t.writes,1);const cp=t.requests.find(r=>r.copyPaste).copyPaste;assert.equal(cp.pasteType,'PASTE_FORMULA');assert.equal(cp.source.startRowIndex,1);assert.equal(cp.destination.startRowIndex,2);assert.equal(cp.source.startColumnIndex,2);assert(!t.requests.some(r=>r.updateCells?.start.columnIndex===2));});
test('formula value injection is refused before writing',()=>{const t=setup(),i=t.input();i.values[2]=168;assert.throws(()=>t.c.saveFormData(i),/公式欄位/);assert.equal(t.writes,0);});
test('existing formula protection is retained',()=>{const t=setup();assert.throws(()=>t.c.checkedValues_(t.data,1,['EMP001','Original',7]),/公式欄位/);});
test('stale previews and ordinary users cannot write',()=>{const t=setup(),i=t.input();i.fingerprint='old';assert.throws(()=>t.c.saveFormData(i),/試算表已被修改/);t.role('一般使用者');assert.throws(()=>t.c.saveFormData(t.input()),/僅管理者/);assert.equal(t.writes,0);});
test('Chinese assignment lock fields map to supported canonical keys',()=>{const t=setup();assert.equal(t.c.formPermission_('AssignmentLocks',true).role,'管理者');assert.equal(Array.from(t.c.canonicalFormHeaders_('AssignmentLocks',['鎖定代碼','員工代碼','日期','班別','鎖定'])).join(','),'lockId,employeeId,date,shiftId,locked');});
test('selection omits empty checkbox rows but keeps explicit zero and identified disabled records',()=>{const h=fs.readFileSync(new URL('../gas/Form.html',import.meta.url),'utf8');const expr=h.match(/const visible=(.*);/)[1];const rows=[{cells:[{value:''},{value:false}]},{cells:[{value:'QA'},{value:false}]},{cells:[{value:0}]},{cells:[{value:'',formula:true}]}];assert.equal(vm.runInNewContext(expr,{formData:{rows}}).length,3);});
