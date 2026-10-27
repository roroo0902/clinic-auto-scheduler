import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../gas/Schedule.gs',import.meta.url),'utf8');
function runtime(role='一般使用者'){
 const header=['年月','員工代碼','姓名',...Array.from({length:31},(_,i)=>String(i+1)),'總工時','資料狀態'];
 const days=Array(31).fill('');days[1]='AC';
 const rows=[header,['2026-11','EMP001','測試甲',...days,7,'PDF 已核對'],['2026-11','EMP002','測試乙',...Array(31).fill(''),0,'本月未提供班次']];
 const binding=[['Google 信箱','員工代碼'],['test@example.com','EMP001']];let writes=0,released=false,revoked=false;
 const ctx={requireMember_:()=>{if(revoked)throw Error('revoked');return {email:'test@example.com',role};},ACCESS_SHEET_ID:'test',cellValue:v=>({userEnteredValue:typeof v==='number'?{numberValue:v}:{stringValue:v}}),LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released=true})},Sheets:{Spreadsheets:{Values:{get:(_,range)=>({values:range.includes('每月工時標準')?[['年月','本月上班天數','預期上班總時數'],['2026-11',21,168]]:range.includes('帳號')?binding:rows})},get:()=>({sheets:[{properties:{title:'月班表',sheetId:1}}]}),batchUpdate:({requests})=>{writes++;for(const r of requests){const u=r.updateCells;u.rows[0].values.forEach((c,i)=>rows[u.start.rowIndex][u.start.columnIndex+i]=Object.values(c.userEnteredValue)[0]);}}}}};vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,rows,binding,get writes(){return writes;},get released(){return released;},revoke:()=>revoked=true};
}
test('personal schedule resolves server-side identity and excludes other staff',()=>{const r=runtime(),s=r.ctx.getSchedule({month:'2026-11',view:'personal',employeeId:'EMP002'});assert.equal(s.employees.length,1);assert.equal(s.employees[0].id,'EMP001');assert.equal(s.employees[0].hours,7);assert.equal(s.dayCount,30);});
test('all view includes explicit missing schedule and excludes emails',()=>{const s=runtime().ctx.getSchedule({month:'2026-11',view:'all'});assert.equal(s.employees.length,2);assert.match(s.employees[1].status,/未提供/);assert.ok(!JSON.stringify(s).includes('@'));});
test('unknown identity, duplicate mapping and revoked user fail closed',()=>{for(const mode of ['missing','duplicate','revoked']){const r=runtime();if(mode==='missing')r.binding.pop();if(mode==='duplicate')r.binding.push(r.binding[1]);if(mode==='revoked')r.revoke();assert.throws(()=>r.ctx.getSchedule({view:'personal'}));}});
test('bad month, view, duplicated employee and total mismatch refused',()=>{for(const arg of [{month:'2026-13'},{view:'__proto__'}])assert.throws(()=>runtime().ctx.getSchedule(arg));const r=runtime();r.rows[1][34]=8;assert.throws(()=>r.ctx.getSchedule({view:'all'}));r.rows[1][34]=7;r.rows.push(r.rows[1]);assert.throws(()=>r.ctx.getSchedule({view:'all'}));});
test('ordinary member cannot write schedule',()=>{const r=runtime();assert.throws(()=>r.ctx.saveScheduleDay({month:'2026-11',employeeId:'EMP001',day:2,before:'AC',shift:'B'}));assert.equal(r.writes,0);});
test('admin save updates one day and total, reads back and releases lock',()=>{const r=runtime('管理者');assert.equal(r.ctx.saveScheduleDay({month:'2026-11',employeeId:'EMP001',day:2,before:'AC',shift:'B'}).ok,true);assert.equal(r.rows[1][4],'B');assert.equal(r.rows[1][34],4);assert.equal(r.rows[2][34],0);assert.equal(r.writes,1);assert.equal(r.released,true);});
test('stale, invalid day and invalid shift never write',()=>{for(const patch of [{before:'A'},{day:31},{shift:'=IMPORTXML()'},{employeeId:'missing'}]){const r=runtime('管理者');assert.throws(()=>r.ctx.saveScheduleDay({month:'2026-11',employeeId:'EMP001',day:2,before:'AC',shift:'B',...patch}));assert.equal(r.writes,0);}});
test('clearing a shift recalculates hours without inventing leave',()=>{const r=runtime('管理者');r.ctx.saveScheduleDay({month:'2026-11',employeeId:'EMP001',day:2,before:'AC',shift:''});assert.equal(r.ctx.getSchedule({view:'personal'}).employees[0].hours,0);});

test('monthly standard is separate from actual shifts and missing months stay unset',()=>{const r=runtime();const s=r.ctx.getSchedule({month:'2026-11',view:'all'});assert.equal(s.standard.workDays,21);assert.equal(s.standard.hours,168);assert.equal(s.employees[0].hours,7);assert.equal(s.employees[0].workDays,1);assert.equal(r.ctx.getSchedule({month:'2026-12',view:'all'}).standard,null);});
