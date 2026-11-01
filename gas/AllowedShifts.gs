// Per-employee allowed combinations. The generic form remains unchanged for other tables.
const AS_COMBOS_ = ['A','B','C','AB','BC','AC','ABC'];
function asDate_(value, optional) {
 if(optional&&value==='')return value;
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))throw Error('請填寫有效日期。');
 const d=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==value)throw Error('日期不存在。');
 return value;
}
function asDay_(date, delta){return new Date(new Date(date+'T12:00:00Z').getTime()+delta*86400000).toISOString().slice(0,10);}
function asRules_(data){
 const expected=['employeeId','combination','allowed','validFrom','validTo','notes'];
 if(JSON.stringify(data.headers)!==JSON.stringify(expected))throw Error('允許班別欄位已變更，請聯絡管理者。');
 return data.rows.filter(r=>r.cells[0]?.value!=='').map(r=>{
  if(r.cells.some(c=>c.formula))throw Error('允許班別含公式，請先由管理者確認。');
  const v=r.cells.map(c=>c.value),[employeeId,combination,allowed,validFrom,validTo]=v;
  if(!employeeId||!AS_COMBOS_.includes(combination)||typeof allowed!=='boolean')throw Error('允許班別第 '+(r.row+1)+' 列資料不完整。');
  asDate_(validFrom,true);asDate_(validTo,true);
  if(validFrom&&validTo&&validFrom>validTo)throw Error('生效日期不可晚於截止日期。');
  return {row:r.row,employeeId,combination,allowed,validFrom,validTo,notes:v[5]||''};
 });
}
function asEmployees_(data){
 const index=k=>data.headers.indexOf(k);
 const ids=new Set(),result=[];
 for(const r of data.rows){
  const id=r.cells[index('employeeId')]?.value,name=r.cells[index('displayName')]?.value,active=r.cells[index('active')]?.value;
  if(!id)continue;if(ids.has(id))throw Error('員工代碼重複，請先確認員工基本資料。');ids.add(id);
  if(active===true){if(!String(name||'').trim())throw Error('啟用員工缺少姓名。');result.push({id,name:String(name)});}
 }
 return result;
}
function asEffective_(rules,id,date,combo){
 const active=rules.filter(r=>r.combination===combo&&(!r.validFrom||r.validFrom<=date)&&(!r.validTo||r.validTo>=date));
 const own=active.filter(r=>r.employeeId===id),matches=own.length?own:active.filter(r=>r.employeeId==='ALL');
 if(matches.length>1)throw Error('同一員工、班別與日期有重複設定，請先整理重疊期間。');
 return matches.length?{allowed:matches[0].allowed,source:own.length?'個人設定':'沿用全體設定'}:{allowed:false,source:'未設定（不允許）'};
}
function asSnapshot_(){
 formPermission_('AllowedShifts',false);
 const data=snapshotForm_('AllowedShifts'),people=snapshotForm_('Employees');
 return {data,people,rules:asRules_(data),employees:asEmployees_(people)};
}
function asPublic_(snap){
 const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
 const ends=snap.rules.filter(r=>r.employeeId==='ALL'&&(!r.validFrom||r.validFrom<=today)&&r.validTo&&r.validTo>=today).map(r=>r.validTo).sort();
 return {employees:snap.employees,rules:snap.rules,fingerprint:snap.data.fingerprint,employeeFingerprint:snap.people.fingerprint,today,defaultTo:ends[0]||''};
}
function getAllowedShiftSettings(){return asPublic_(asSnapshot_());}

// Preserve disjoint periods and split overlaps, so earlier and later settings survive.
function asPlan_(data,employees,input){
 if(!input||!Array.isArray(input.people)||!input.people.length||input.people.length>100)throw Error('請至少選擇一位員工。');
 const from=asDate_(input.validFrom,false),to=asDate_(input.validTo,true);
 if(to&&from>to)throw Error('生效日期不可晚於截止日期。');
 const rules=asRules_(data),known=new Set(employees.map(e=>e.id)),seen=new Set(),updates=new Map(),summary=[];
 let next=Math.max(0,...data.rows.map(r=>r.row))+1;
 const append=v=>updates.set(next++,v);
 const max='9999-12-31',min='0001-01-01';
 for(const person of input.people){
  if(!person||!known.has(person.id)||seen.has(person.id))throw Error('員工已停用、不存在或重複，請重新讀取。');seen.add(person.id);
  if(!Array.isArray(person.allowed)||person.allowed.some(c=>!AS_COMBOS_.includes(c))||new Set(person.allowed).size!==person.allowed.length)throw Error('班別選項不正確。');
  const details=[];
  for(const combo of AS_COMBOS_){
   const own=rules.filter(r=>r.employeeId===person.id&&r.combination===combo).sort((a,b)=>(a.validFrom||min).localeCompare(b.validFrom||min));
   for(let i=1;i<own.length;i++)if((own[i].validFrom||min)<=(own[i-1].validTo||max))throw Error('個人班別期間重疊，請先由管理者整理。');
   const overlap=own.filter(r=>(r.validFrom||min)<=(to||max)&&(r.validTo||max)>=from);
   const allowed=person.allowed.includes(combo),effective=asEffective_(rules,person.id,from,combo);
   const exact=overlap.length===1&&overlap[0].validFrom===from&&overlap[0].validTo===to;
   if(exact&&overlap[0].allowed===allowed)continue;
   const notes=overlap[0]?.notes||'';
   const values=[person.id,combo,allowed,from,to,notes];
   if(overlap.length){
    updates.set(overlap[0].row,values);
    for(const r of overlap){
     if(r.row!==overlap[0].row)updates.set(r.row,['','',false,'','','']);
     if((r.validFrom||min)<from)append([r.employeeId,r.combination,r.allowed,r.validFrom,asDay_(from,-1),r.notes]);
     if(to&&(r.validTo||max)>to)append([r.employeeId,r.combination,r.allowed,asDay_(to,1),r.validTo,r.notes]);
    }
   }else append(values);
   details.push({combo,before:effective.allowed,after:allowed,source:effective.source,action:overlap.length?'更新個人期間':'建立個人設定'});
  }
  if(details.length)summary.push({id:person.id,name:employees.find(e=>e.id===person.id).name,details,allowed:AS_COMBOS_.filter(c=>person.allowed.includes(c))});
 }
 if(next>1000)throw Error('允許班別已達資料列上限，請先由管理者整理歷史設定。');
 const operations=[...updates].map(([row,values])=>({row,values}));
 return {operations,summary,validFrom:from,validTo:to};
}
function asCheckFingerprints_(snap,input){
 if(!input||input.fingerprint!==snap.data.fingerprint||input.employeeFingerprint!==snap.people.fingerprint)throw Error('資料或員工名單已更新，請重新讀取後再預覽。');
}
function previewAllowedShiftSettings(input){
 formPermission_('AllowedShifts',true);const snap=asSnapshot_();asCheckFingerprints_(snap,input);
 const plan=asPlan_(snap.data,snap.employees,input);
 return {summary:plan.summary,validFrom:plan.validFrom,validTo:plan.validTo,changedRows:plan.operations.length};
}
function asRequests_(data,plan){
 const requests=[],last=Math.max(0,...plan.operations.map(x=>x.row));
 if(last>=data.rowCount)requests.push({appendDimension:{sheetId:data.sheetId,dimension:'ROWS',length:last-data.rowCount+1}});
 for(const op of plan.operations){
  const old=data.rows.find(r=>r.row===op.row);
  // Retain per-cell validation checks and formula protection from the existing form.
  if(op.values[0])checkedValues_(data,old?op.row:-1,op.values);
  requests.push({updateCells:{start:{sheetId:data.sheetId,rowIndex:op.row,columnIndex:0},rows:[{values:op.values.map(cellValue)}],fields:'userEnteredValue'}});
  requests.push({setDataValidation:{range:{sheetId:data.sheetId,startRowIndex:op.row,endRowIndex:op.row+1,startColumnIndex:2,endColumnIndex:3},rule:{condition:{type:'BOOLEAN'},strict:true,showCustomUi:true}}});
 }
 return requests;
}
function saveAllowedShiftSettings(input){
 formPermission_('AllowedShifts',true);
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後重新讀取。');
 try{
  const snap=asSnapshot_();formPermission_('AllowedShifts',true);asCheckFingerprints_(snap,input);
  const plan=asPlan_(snap.data,snap.employees,input);
  if(!plan.operations.length)throw Error('沒有需要儲存的變更。');
  const verify=asCommit_(snap,plan,ACCESS_SHEET_ID,asSnapshot_);
  return {ok:true,employeeCount:plan.summary.length,changedRows:plan.operations.length,data:asPublic_(verify)};
 }finally{lock.releaseLock();}
}
function asCommit_(snap,plan,spreadsheetId,readback){
  const requests=asRequests_(snap.data,plan);
  Sheets.Spreadsheets.batchUpdate({requests},spreadsheetId);
  const verify=readback();
  for(const op of plan.operations){const actual=verify.data.rows.find(r=>r.row===op.row);if(!actual||op.values.some((v,i)=>actual.cells[i]?.value!==v))throw Error('已送出寫入，但讀回未確認，請重新讀取，勿重複送出。');}
  const affected=new Set(plan.operations.map(x=>x.row));
  for(const before of snap.data.rows)if(!affected.has(before.row)){
   const actual=verify.data.rows.find(r=>r.row===before.row);
   if(!actual||before.cells.some((c,i)=>c.value!==actual.cells[i]?.value||c.formula!==actual.cells[i]?.formula))throw Error('其他資料同時變更，請重新讀取核對。');
  }
  return verify;
}
