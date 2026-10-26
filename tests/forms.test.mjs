import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import crypto from 'node:crypto';
const files=['Model.gs','Data.gs'];const code=files.map(f=>fs.readFileSync(new URL('../gas/'+f,import.meta.url),'utf8')).join('\n');
function setup(name='Employees',headers=['employeeId','displayName','active'],values=[['EMP001','Amy',true]],actualTitle=name){
 let role='管理者',revoked=false,writes=0;const cells=[headers,...values].map(row=>({values:row.map(v=>({userEnteredValue:typeof v==='boolean'?{boolValue:v}:typeof v==='number'?{numberValue:v}:{stringValue:v},formattedValue:String(v)}))}));
 const properties={sheetId:1,title:actualTitle,gridProperties:{rowCount:1000,columnCount:26}};
 const ctx={ACCESS_SHEET_ID:'test-sheet',requireMember_:()=>{if(revoked)throw Error('revoked');return {role};},Session:{getActiveUser:()=>({getEmail:()=> 'admin@example.com'})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,v)=>crypto.createHash('sha256').update(v).digest(),base64EncodeWebSafe:b=>Buffer.from(b).toString('base64url')},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},Sheets:{Spreadsheets:{get:(_,options)=>({sheets:[{properties,...(options.includeGridData?{data:[{rowData:cells}]}:{})}]}),batchUpdate:({requests})=>{writes++;for(const r of requests){if(!r.updateCells)continue;const u=r.updateCells;cells[u.start.rowIndex]??={values:[]};cells[u.start.rowIndex].values[u.start.columnIndex]=u.rows[0].values[0];}}}}};
 vm.createContext(ctx);vm.runInContext(code,ctx);return {ctx,cells,get writes(){return writes;},role:v=>role=v,revoke:()=>revoked=true,request:(row,values)=>({name,row,values,fingerprint:ctx.getFormData(name).fingerprint})};
}
test('edit and append persist typed values and read back',()=>{const s=setup();assert.equal(s.ctx.saveFormData(s.request(1,['EMP001','Anne',false])).row,2);assert.equal(s.ctx.saveFormData(s.request(-1,['EMP002','Bob',true])).row,3);assert.equal(s.writes,2);});
test('ordinary employee cannot edit underlying staff records',()=>{const s=setup(),request=s.request(1,['EMP001','Changed',true]);s.role('一般使用者');assert.throws(()=>s.ctx.saveFormData(request));assert.equal(s.writes,0);});
test('revoked user cannot save an earlier preview',()=>{const s=setup(),r=s.request(1,['EMP001','Anne',true]);s.revoke();assert.throws(()=>s.ctx.saveFormData(r));assert.equal(s.writes,0);});
test('stale preview or replay never writes',()=>{const s=setup(),r=s.request(-1,['EMP002','Bob',true]);s.ctx.saveFormData(r);assert.throws(()=>s.ctx.saveFormData(r));assert.equal(s.writes,1);});
test('duplicate IDs and key edits are refused',()=>{const s=setup();assert.throws(()=>s.ctx.saveFormData(s.request(-1,['EMP001','Bob',true])));assert.throws(()=>s.ctx.saveFormData(s.request(1,['EMP003','Amy',true])));assert.equal(s.writes,0);});
test('formula payload is stored as a string, never executed',()=>{const s=setup();s.ctx.saveFormData(s.request(1,['EMP001','=IMPORTXML("x","y")',true]));assert.equal(s.cells[1].values[1].userEnteredValue.stringValue,'=IMPORTXML("x","y")');});
test('formula fields and native dropdown validation enforced server side',()=>{const s=setup();s.cells[1].values[1]={userEnteredValue:{formulaValue:'="Amy"'},formattedValue:'Amy'};assert.throws(()=>s.ctx.saveFormData(s.request(1,['EMP001','changed',true])));s.cells[1].values[1]={userEnteredValue:{stringValue:'Amy'},dataValidation:{condition:{type:'ONE_OF_LIST',values:[{userEnteredValue:'Amy'}]}}};assert.throws(()=>s.ctx.saveFormData(s.request(1,['EMP001','Bob',true])));assert.equal(s.writes,0);});
test('admin-only settings and unsupported destinations are denied',()=>{const s=setup('SystemConfig',['key','value'],[['year','2026']]);s.role('一般使用者');assert.throws(()=>s.ctx.getFormData('SystemConfig'));assert.throws(()=>s.ctx.getFormData('Unknown'));});
test('read-only output cannot be written',()=>{const s=setup('Schedule_W1初版',['date','shiftId'],[['2026-11-01','A']]);assert.throws(()=>s.ctx.saveFormData(s.request(1,['2026-11-01','B'])));assert.equal(s.writes,0);});
test('maximum staffing checked on the server',()=>{const s=setup('DailyShiftDemands',['demandId','date','shiftId','requiredHeadcount','MaxStaff'],[['D1','2026-11-01','A',2,3]]);assert.throws(()=>s.ctx.saveFormData(s.request(1,['D1','2026-11-01','A',4,3])));assert.equal(s.writes,0);});
test('API object property order does not cause a false stale-data conflict',()=>{const s=setup(),r=s.request(1,['EMP001','Anne',true]);for(const row of s.cells)row.values=row.values.map(c=>({formattedValue:c.formattedValue,userEnteredValue:c.userEnteredValue}));assert.equal(s.ctx.saveFormData(r).ok,true);});

test('Chinese sheet and headers preserve typed edit and append behavior',()=>{
 const s=setup('Employees',['員工代碼','姓名','啟用'],[['EMP001','Amy',true]],'員工基本資料');
 assert.deepEqual(Array.from(s.ctx.getFormData('Employees').headers),['employeeId','displayName','active']);
 assert.equal(s.ctx.saveFormData(s.request(1,['EMP001','Anne',false])).ok,true);
 assert.equal(s.ctx.saveFormData(s.request(-1,['EMP002','Bob',true])).ok,true);
 assert.equal(s.cells[0].values[0].userEnteredValue.stringValue,'員工代碼');
});
test('Chinese staffing headers enforce maximum staffing and closed shifts',()=>{
 const s=setup('DailyShiftDemands',['需求代碼','日期','班別','最低人數','最高人數','理想人數','此班休診'],[['D1','2026-11-01','A',2,3,3,false]],'每日班別人力需求');
 for(const values of [
  ['D1','2026-11-01','A',4,3,3,false],
  ['D1','2026-11-01','A',2,3,4,false],
  ['D1','2026-11-01','A',2,3,3,true]
 ])assert.throws(()=>s.ctx.saveFormData(s.request(1,values)));
 assert.equal(s.writes,0);
});
test('Chinese employee headers retain required name, ID and integer checks',()=>{
 const s=setup('Employees',['員工代碼','姓名','每週最多工作日'],[['EMP001','Amy',5]],'員工基本資料');
 for(const values of [['EMP001','',5],['EMP001','Amy',8],['EMP001','Amy',3.5],['EMP002','Amy',5]])
  assert.throws(()=>s.ctx.saveFormData(s.request(1,values)));
 assert.equal(s.writes,0);
});
test('renaming headers invalidates existing previews',()=>{
 const s=setup(),r=s.request(1,['EMP001','Anne',true]);
 ['員工代碼','姓名','啟用'].forEach((v,i)=>s.cells[0].values[i].userEnteredValue.stringValue=v);
 assert.throws(()=>s.ctx.saveFormData(r),/試算表已被修改/);
 assert.equal(s.writes,0);
});
test('duplicate canonical headers fail closed',()=>{
 const s=setup('Employees',['employeeId','員工代碼','姓名'],[['EMP001','EMP001','Amy']],'員工基本資料');
 assert.throws(()=>s.ctx.getFormData('Employees'),/欄位名稱空白或重複/);
});
test('Chinese administrator-only and read-only sheets keep permissions',()=>{
 const s=setup('SystemConfig',['參數代碼','設定值'],[['year','2026']],'系統參數');s.role('一般使用者');
 assert.throws(()=>s.ctx.getFormData('SystemConfig'));
 const output=setup('Schedule_W1初版',['日期','班別'],[['2026-11-01','A']],'班表初版');
 assert.throws(()=>output.ctx.saveFormData(output.request(1,['2026-11-01','B'])));
 assert.equal(output.writes,0);
});
