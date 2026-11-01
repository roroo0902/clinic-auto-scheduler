const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../gas/ScheduleLocks.gs'),'utf8');
const headers=['鎖定代碼','員工代碼','日期','班別','鎖定','鎖定者','鎖定時間','原因','版本'];
function runtime(shift='',role='管理者'){
 let rows=[headers.slice(),['','','','',false]],writes=0,released=0,drop=false;
 const schedule={month:'2026-11',view:'all',dayCount:30,canEdit:true,employees:[{id:'E1',name:'測試員工',days:[shift,...Array(29).fill('')]}]};
 const ctx={requireMember_:()=>({role,email:'admin@example.com'}),scheduleRows_:()=>structuredClone(rows),readSheets_:fn=>fn(),ACCESS_SHEET_ID:'isolated',cellValue:v=>({userEnteredValue:{[typeof v==='boolean'?'boolValue':typeof v==='number'?'numberValue':'stringValue']:v}}),LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>released++})},Sheets:{Spreadsheets:{get:()=>({sheets:[{properties:{title:'排班鎖定設定',sheetId:7,gridProperties:{rowCount:1000}}}]}),batchUpdate:({requests})=>{writes++;if(drop)return;for(const request of requests){const u=request.updateCells;if(u)rows[u.start.rowIndex]=u.rows[0].values.map(c=>Object.values(c.userEnteredValue)[0]);}}}}};
 ctx.Sheets.Spreadsheets.Values={get:()=>({values:structuredClone(rows)})};
 vm.createContext(ctx);vm.runInContext(source,ctx);ctx.getSchedule=()=>ctx.dayLockDecorate_(structuredClone(schedule));
 const input=()=>({month:'2026-11',employeeId:'E1',day:1,before:shift,locked:true,fingerprint:ctx.dayLockFingerprint_(rows,'E1','2026-11-01'),view:'all'});
 return {ctx,input,schedule,get rows(){return rows;},get writes(){return writes;},get released(){return released;},drop:()=>drop=true};
}
for(const shift of ['','A','B','C','AB','AC','BC','ABC'])test('whole-day lock and unlock preserves baseline '+(shift||'rest'),()=>{
 const r=runtime(shift),before=JSON.stringify(r.schedule),result=r.ctx.saveScheduleDayLock(r.input()),state=result.schedule.employees[0].dayLocks[0];
 assert.equal(state.locked,true);assert.equal(state.full,true);assert.equal(r.rows.filter(x=>x[4]===true).length,3);assert.equal(JSON.stringify(r.schedule),before);assert.equal(r.released,1);
 assert.throws(()=>r.ctx.dayLockAssertEditable_(result.schedule.employees[0],1),/先在班表解除/);
 const unlocked=r.ctx.saveScheduleDayLock({...r.input(),locked:false});assert.equal(unlocked.schedule.employees[0].dayLocks[0].locked,false);assert.equal(r.writes,2);assert.equal(r.released,2);
});
test('ordinary member cannot lock or unlock',()=>{const r=runtime('','一般使用者');assert.throws(()=>r.ctx.saveScheduleDayLock(r.input()),/僅管理者/);assert.equal(r.writes,0);});
test('stale shift, stale lock, bad day and missing employee do not write',()=>{for(const patch of [{before:'C'},{fingerprint:'stale'},{day:31},{day:0},{employeeId:'E2'},{locked:'true'}]){const r=runtime('AB');assert.throws(()=>r.ctx.saveScheduleDayLock({...r.input(),...patch}));assert.equal(r.writes,0);}});
test('double submission rejects stale fingerprint',()=>{const r=runtime(),input=r.input();r.ctx.saveScheduleDayLock(input);assert.throws(()=>r.ctx.saveScheduleDayLock(input),/狀態已變更/);assert.equal(r.writes,1);});
test('failed readback reports uncertain outcome and releases lock',()=>{const r=runtime();r.drop();assert.throws(()=>r.ctx.saveScheduleDayLock(r.input()),/核對未完成/);assert.equal(r.released,1);});
test('existing partial/duplicate locks all unlock and unrelated records survive',()=>{const r=runtime('AB');r.rows.push(['legacy','E1','2026-11-01','AB',true],['other','E2','2026-11-01','A',true]);r.ctx.saveScheduleDayLock({...r.input(),locked:false});assert.equal(r.rows[2][4],false);assert.equal(r.rows[3][4],true);});
test('UI and merger contain direct cell keyboard access, preview and server guard',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../gas/ScheduleLocks.html'),'utf8'),merge=fs.readFileSync(path.join(__dirname,'../scripts/merge-schedule-locks.cjs'),'utf8');
 assert.match(html,/確認解除鎖定/);assert.match(html,/確認鎖定/);assert.match(html,/onkeydown/);assert.match(html,/scheduleData!==data/);assert.match(merge,/dayLockAssertEditable_\(employee,input.day\)/);
});
test('automatic engine preserves present AND absent shifts, including rest',()=>{
 const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../gas/AutoEngine.gs'),'utf8'),ctx);
 for(const baseline of ['','A','AB','ABC']){
  const date='2026-11-01',e={employeeId:'E1'},tables={AllowedShifts:['','A','B','C','AB','AC','BC','ABC'].map(combination=>({employeeId:'E1',combination,allowed:true})),AssignmentLocks:['A','B','C'].map(shiftId=>({employeeId:'E1',date,shiftId,locked:true}))};
  const p={month:'2026-11',tables,calendar:{[date]:{isOperatingDay:true}},existing:{E1:{[date]:baseline}},demands:{}};
  assert.deepEqual(Array.from(ctx.autoOptions_(p,e,date)),[baseline]);
 }
});
