// Exact weekly assignments, with versioned templates and date exceptions.
const WF_TAB_='每週指定班別歷程';
const WF_HEADERS_=['版本代碼','類型','生效或指定日期','員工代碼','設定內容','建立時間','建立者'];
const WF_VALUES_=['UNSET','OFF','A','B','C','AB','AC','BC','ABC'];
function wfAdmin_(){const u=requireMember_();if(u.role!=='管理者')throw Error('只有管理者可以設定指定班別。');return u;}
function wfDate_(d){if(typeof d!=='string'||!/^20\d{2}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d+'T00:00:00Z'))||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('日期不正確。');return d;}
function wfDates_(m){if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m||''))throw Error('請選擇有效月份。');return Array.from({length:new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).getUTCDate()},(_,i)=>m+'-'+String(i+1).padStart(2,'0'));}
function wfEntry_(e){wfDate_(e.date);if(typeof e.employeeId!=='string'||!e.employeeId||e.employeeId.startsWith('='))throw Error('員工代碼不正確。');if(e.type==='weekly'){if(!Array.isArray(e.value)||e.value.length!==7||e.value.some(v=>!WF_VALUES_.includes(v)))throw Error('請完成星期一至日的班別。');}else if(e.type!=='exception'||!WF_VALUES_.concat('INHERIT').includes(e.value))throw Error('特殊日期班別不正確。');return e;}
function wfRead_(){
 const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'})),props=(meta.sheets||[]).map(s=>s.properties),sheet=props.find(s=>s.title===WF_TAB_);
 const raw=sheet?(readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'"+WF_TAB_+"'!A1:G"+Math.min(10001,sheet.gridProperties.rowCount),{valueRenderOption:'FORMULA'})).values||[]):[];
 if(raw.length>=10001||raw.length&&WF_HEADERS_.some((h,i)=>raw[0][i]!==h)||raw.some(r=>r.some(v=>typeof v==='string'&&v.startsWith('='))))throw Error('指定班別歷程欄位、公式或資料範圍異常，請先核對。');
 const entries=raw.slice(1).map(r=>wfEntry_({id:r[0],type:r[1],date:r[2],employeeId:r[3],value:JSON.parse(r[4])}));
 return {sheet,raw,entries,hash:autoHash_(raw),ids:props.map(p=>p.sheetId)};
}
function wfRule_(entries,id,date){
 let weekly=null,exception=null;
 for(const e of entries){if(e.employeeId!==id)continue;if(e.type==='weekly'&&e.date<=date&&(!weekly||e.date>=weekly.date))weekly=e;if(e.type==='exception'&&e.date===date)exception=e;}
 if(exception&&exception.value!=='INHERIT')return {value:exception.value,source:'特殊日期'};
 if(!weekly)return null;
 return {value:weekly.value[(new Date(date+'T00:00:00Z').getUTCDay()||7)-1],source:'每週範本',effectiveFrom:weekly.date,ignoreLegacy:!!exception};
}
function wfResolved_(entries,legacy,id,date){
 const rule=wfRule_(entries,id,date),old=legacy.filter(r=>(r.employeeId===id||r.employeeId==='ALL')&&r.date===date&&(!r.validFrom||r.validFrom<=date)&&(!r.validTo||r.validTo>=date));
 if(rule?.source==='特殊日期'||rule?.ignoreLegacy)return rule;
 if(old.length)return {value:[...new Set(old.map(r=>r.shiftId).join(''))].sort().join(''),source:'原指定日期（至少包含）',legacy:true};
 return rule||{value:'UNSET',source:'未指定'};
}
function wfOverlay_(tables,entries,month){
 if(!entries.length)return tables;
 const out={...tables,ForcedShifts:(tables.ForcedShifts||[]).flatMap(r=>r.employeeId==='ALL'?(tables.Employees||[]).map(e=>({...r,employeeId:e.employeeId})):r),EmployeeAvailability:[...(tables.EmployeeAvailability||[])]};
 for(const e of tables.Employees||[])for(const date of wfDates_(month)){
  const r=wfResolved_(entries,tables.ForcedShifts||[],e.employeeId,date);if(r.legacy||r.source==='未指定')continue;
  // Weekly UNSET leaves legacy data intact; explicit date UNSET clears only the forced rule.
  out.ForcedShifts=out.ForcedShifts.filter(x=>!(x.employeeId===e.employeeId&&x.date===date));
  if(r.value==='UNSET')continue;
  const combo=r.value==='OFF'?'':r.value;
  for(const shift of 'ABC')if(combo.includes(shift))out.ForcedShifts.push({forcedShiftId:'WF-'+e.employeeId+'-'+date+'-'+shift,employeeId:e.employeeId,date,shiftId:shift,source:r.source,validFrom:date,validTo:date,version:1});
  else out.EmployeeAvailability.push({availabilityId:'WF-'+e.employeeId+'-'+date+'-'+shift,employeeId:e.employeeId,date,shiftId:shift,conditionType:'UNAVAILABLE',isHard:true,validFrom:date,validTo:date,source:r.source});
 }return out;
}
function wfPeople_(){const data=snapshotForm_('Employees');return {list:asEmployees_(data),hash:data.fingerprint};}
function wfLegacy_(){const data=snapshotForm_('ForcedShifts');return {rows:data.rows.filter(r=>r.cells[0]?.value).map(r=>Object.fromEntries(data.headers.map((k,i)=>[k,r.cells[i]?.value??'']))),hash:data.fingerprint};}
function getWeeklyForced(input){
 wfAdmin_();const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd'),date=wfDate_(input?.date||today),month=input?.month||date.slice(0,7);wfDates_(month);
 const s=wfRead_(),people=wfPeople_(),legacy=wfLegacy_();
 return {today,date,month,employees:people.list,hash:autoHash_([s.hash,people.hash,legacy.hash]),entries:s.entries,legacy:legacy.rows,weekly:people.list.map(e=>{let rule=null;for(const r of s.entries)if(r.employeeId===e.id&&r.type==='weekly'&&r.date<=date&&(!rule||r.date>=rule.date))rule=r;return {employeeId:e.id,value:rule?.value||Array(7).fill('UNSET'),effectiveFrom:rule?.date||''};})};
}
function wfDraft_(input,people,today){
 const date=wfDate_(input.date),month=input.month;wfDates_(month);if(date<today)throw Error('生效日期請選今天或之後，歷史設定不修改。');
 if(!Array.isArray(input.weekly)||input.weekly.length!==people.length)throw Error('員工清單已變更，請重新讀取。');
 const ids=new Set(),changes=[];
 for(const r of input.weekly){if(!people.some(e=>e.id===r.employeeId)||ids.has(r.employeeId))throw Error('員工不存在或重複。');ids.add(r.employeeId);changes.push(wfEntry_({type:'weekly',date,employeeId:r.employeeId,value:r.value}));}
 if(!Array.isArray(input.exceptions)||input.exceptions.length>200)throw Error('特殊日期設定過多或格式錯誤。');
 const seen=new Set();for(const r of input.exceptions){if(!ids.has(r.employeeId)||r.date<today)throw Error('特殊日期請選今天或之後的啟用員工。');const key=r.employeeId+'|'+r.date;if(seen.has(key))throw Error('同一員工的特殊日期重複。');seen.add(key);changes.push(wfEntry_({...r,type:'exception'}));}
 return {date,month,changes};
}
function wfCoverage_(entries,legacy,people,month){return people.map(e=>({...e,days:wfDates_(month).map(date=>({date,...wfResolved_(entries,legacy,e.id,date)}))}));}
function previewWeeklyForced(input){
 wfAdmin_();const current=getWeeklyForced({date:input.date,month:input.month});if(current.hash!==input.hash)throw Error('資料已更新，請重新讀取再預覽。');
 const draft=wfDraft_(input,current.employees,current.today),entries=current.entries.concat(draft.changes),coverage=wfCoverage_(entries,current.legacy,current.employees,draft.month);
 const snap=wfBaseAutoSnapshot_(draft.month,'production'),tables=wfOverlay_(snap.input.tables,entries,draft.month),p=autoPrepare_({...snap.input,tables}),conflicts=[];
 if(p.dates&&p.employees&&p.calendar)for(const e of p.employees)for(const date of p.dates){const r=wfRule_(entries,e.employeeId,date);if(r&&r.value!=='UNSET'&&p.calendar[date]){try{if(!autoOptions_(p,e,date).length)conflicts.push((current.employees.find(x=>x.id===e.employeeId)?.name||e.employeeId)+' '+date+'：與可排時段、請假、允許班別或鎖定等設定衝突。');}catch(err){conflicts.push(e.employeeId+' '+date+'：其他排班資料尚未完整，請先完成排班檢查。');}}}
 const token=Utilities.getUuid(),cached=JSON.stringify({hash:current.hash,draft,snapshot:autoHash_([snap.fingerprint,wfRead_().raw])});if(Utilities.newBlob(cached).getBytes().length>95000)throw Error('設定資料過多，請分次設定。');CacheService.getUserCache().put('wf:'+token,cached,600);
 return {token,coverage,conflicts:[...new Set(conflicts)],inputIssues:(p.issues||[]).map(x=>x.message),future:current.entries.filter(e=>e.type==='weekly'&&e.date>draft.date).map(e=>e.date).filter((v,i,a)=>a.indexOf(v)===i).sort(),message:'從 '+draft.date+' 起依星期跨月沿用；特殊日期優先。只儲存規則，不會直接更動已發布班表。'};
}
function applyWeeklyForced(input){
 const actor=wfAdmin_();if(input?.confirmed!==true||!/^[-\w]{20,80}$/.test(input.token||''))throw Error('請先預覽並確認。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後再試。');
 try{const cache=CacheService.getUserCache(),key='wf:'+input.token,json=cache.get(key);if(!json)throw Error('預覽已到期或已送出，請重新讀取。');const saved=JSON.parse(json),d=saved.draft,current=getWeeklyForced({date:d.date,month:d.month});
  if(current.hash!==saved.hash||autoSnapshot_(d.month,'production').fingerprint!==saved.snapshot)throw Error('資料已變更，請重新預覽。');
  for(const e of d.changes){wfEntry_(e);if(e.date<current.today||!current.employees.some(p=>p.id===e.employeeId))throw Error('日期或員工已變更，請重新預覽。');}
  const s=wfRead_(),requests=[],ids=new Set(s.ids);let id=s.sheet?.sheetId,start=s.raw.length||1;
  const rows=d.changes.map(e=>[input.token,e.type,e.date,e.employeeId,JSON.stringify(e.value),new Date().toISOString(),actor.email||'']);if(start+rows.length>10000)throw Error('歷程已達上限，請先封存。');
  if(id===undefined){id=1;while(ids.has(id))id++;requests.push({addSheet:{properties:{sheetId:id,title:WF_TAB_,gridProperties:{rowCount:Math.max(1000,start+rows.length),columnCount:7}}}});}else{let backup=1;while(ids.has(backup))backup++;requests.push({duplicateSheet:{sourceSheetId:id,newSheetId:backup,newSheetName:'指定班別備份_'+input.token.slice(0,8)}},{updateSheetProperties:{properties:{sheetId:backup,hidden:true},fields:'hidden'}});if(start+rows.length>s.sheet.gridProperties.rowCount)requests.push({appendDimension:{sheetId:id,dimension:'ROWS',length:start+rows.length-s.sheet.gridProperties.rowCount}});}
  if(!s.raw.length)requests.push({updateCells:{start:{sheetId:id,rowIndex:0,columnIndex:0},rows:[{values:WF_HEADERS_.map(cellValue)}],fields:'userEnteredValue'}});
  requests.push({updateCells:{start:{sheetId:id,rowIndex:start,columnIndex:0},rows:rows.map(r=>({values:r.map(cellValue)})),fields:'userEnteredValue'}});
  if(getWeeklyForced({date:d.date,month:d.month}).hash!==saved.hash)throw Error('送出前資料已變更，請重新預覽。');cache.remove(key);Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);
  const check=wfRead_();if(JSON.stringify(check.raw.slice(start,start+rows.length))!==JSON.stringify(rows))throw Error('寫入已送出但核對未完成，請重新讀取，勿重複送出。');return {ok:true,date:d.date};
 }finally{lock.releaseLock();}
}
const wfBaseAutoSnapshot_=autoSnapshot_;
autoSnapshot_=function(month,mode){const snap=wfBaseAutoSnapshot_(month,mode);if(mode==='acceptance')return snap;const state=wfRead_();snap.input.tables=wfOverlay_(snap.input.tables,state.entries,month);snap.raw._weeklyForced=state.raw;snap.fingerprint=autoHash_([snap.fingerprint,state.raw]);return snap;};
const wfBaseSuggestionSnapshot_=suggestionSnapshot_;
suggestionSnapshot_=function(){const snap=wfBaseSuggestionSnapshot_(),state=wfRead_();snap.tables._weeklyForced=state.entries;snap.fingerprint=autoHash_([snap.fingerprint,state.raw]);return snap;};
const wfBaseBuildSuggestion_=buildScheduleSuggestion_;
buildScheduleSuggestion_=function(tables,month,mode){
 if(!tables._weeklyForced?.length)return wfBaseBuildSuggestion_(tables,month,mode);
 if(typeof waSuggestionOverlay_==='function'){tables=waSuggestionOverlay_(tables,month);tables={...tables};delete tables._weeklyAvailability;}
 const names={Employees:'員工基本資料',ForcedShifts:'指定班別',EmployeeAvailability:'指定日期可排時段'},canonical={};
 for(const [key,title]of Object.entries(names)){const raw=tables[title]||[],keys=canonicalFormHeaders_(key,raw[0]||[]);canonical[key]=raw.slice(1).filter(r=>r[0]).map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]??''])));}
 const out={...tables},resolved=wfOverlay_(canonical,tables._weeklyForced,month);
 for(const key of ['ForcedShifts','EmployeeAvailability']){const title=names[key],head=tables[title]?.[0];if(!head)throw Error('缺少指定班別或可排時段資料。');const keys=canonicalFormHeaders_(key,head);out[title]=[head,...resolved[key].map(r=>keys.map(k=>r[k]??''))];}
 return wfBaseBuildSuggestion_(out,month,mode);
};
const wfBaseMenu_=getMenuSection;
getMenuSection=function(section){const result=wfBaseMenu_(section);result.links=result.links.map(l=>l.name==='ForcedShifts'?{...l,label:'每週指定班別'}:l);return result;};

