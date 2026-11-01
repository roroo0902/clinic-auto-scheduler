// A seven-day availability template per employee/month; never writes schedules.
const WA_WEEK_='每週可上班設定', WA_DATE_='特殊日期可上班設定';
const WA_HEADERS_={weekly:['月份','員工代碼','姓名','星期','早班可排','午班可排','晚班可排','更新時間','更新者'],exceptions:['日期','員工代碼','姓名','早班可排','午班可排','晚班可排','更新時間','更新者']};
function waMonth_(m){if(typeof m!=='string'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))throw Error('請選擇有效月份。');return m;}
function waDates_(m){waMonth_(m);return Array.from({length:new Date(Date.UTC(+m.slice(0,4),+m.slice(5),0)).getUTCDate()},(_,i)=>m+'-'+String(i+1).padStart(2,'0'));}
function waHash_(o){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(o)));}
function waAdmin_(){const u=requireMember_();if(u.role!=='管理者')throw Error('只有管理者可以設定可上班時段。');return u;}
function waParse_(weekly,exceptions){
 const seen=new Set(),out={weekly:[],exceptions:[]};
 for(const [kind,raw]of Object.entries({weekly,exceptions}))for(const r of raw){
  const date=kind==='weekly'?waMonth_(r[0]):String(r[0]||'');
  if(kind==='exceptions'&&(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!waDates_(date.slice(0,7)).includes(date)))throw Error('特殊日期設定含無效日期。');
  const offset=kind==='weekly'?4:3,weekday=kind==='weekly'?Number(r[3]):null;
  if(!r[1]||!r[2]||kind==='weekly'&&(!Number.isInteger(weekday)||weekday<1||weekday>7)||r.slice(offset,offset+3).length!==3||r.slice(offset,offset+3).some(v=>typeof v!=='boolean'))throw Error('可上班設定有空白或格式不正確，請核對勾選欄位。');
  const key=kind+'|'+date+'|'+r[1]+'|'+weekday;if(seen.has(key))throw Error('同一員工日期或星期設定重複，請先核對。');seen.add(key);
  out[kind].push({date,employeeId:r[1],name:r[2],weekday,shifts:r.slice(offset,offset+3)});
 }
 for(const r of out.weekly)if(out.weekly.filter(x=>x.date===r.date&&x.employeeId===r.employeeId).length!==7)throw Error('每週設定必須包含完整星期一至日。');
 return out;
}
function waRead_(){
 const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'}));const map={},raw={weekly:[],exceptions:[]},properties=(meta.sheets||[]).map(s=>s.properties),employeeSheet=properties.find(p=>p.title==='員工基本資料'||p.title==='Employees');
 if(!employeeSheet)throw Error('缺少員工基本資料。');
 const found=['weekly','exceptions'].filter(kind=>{map[kind]=properties.find(p=>p.title===(kind==='weekly'?WA_WEEK_:WA_DATE_));return !!map[kind];});
 const ranges=found.map(kind=>"'"+map[kind].title+"'!A1:"+(kind==='weekly'?'I':'H')+Math.min(10001,map[kind].gridProperties.rowCount));
 ranges.push("'"+employeeSheet.title+"'!A1:C"+Math.min(1001,employeeSheet.gridProperties.rowCount));
 const batch=readSheets_(()=>Sheets.Spreadsheets.Values.batchGet(ACCESS_SHEET_ID,{ranges,valueRenderOption:'FORMULA'}));if(batch.valueRanges?.length!==ranges.length)throw Error('設定資料未完整讀取。');
 for(const [kind,title]of Object.entries({weekly:WA_WEEK_,exceptions:WA_DATE_})){
  const p=(meta.sheets||[]).find(s=>s.properties.title===title)?.properties;map[kind]=p;if(!p)continue;
  if(p.gridProperties.columnCount<WA_HEADERS_[kind].length)throw Error(title+' 欄位不足。');
  const rows=batch.valueRanges[found.indexOf(kind)].values||[];
  if(rows.length>=10001||WA_HEADERS_[kind].some((h,i)=>rows[0]?.[i]!==h))throw Error(title+' 標題或資料範圍不正確。');
  raw[kind]=rows.slice(1).filter(r=>r.some(v=>v!==''&&v!==false&&v!=null));
  if(raw[kind].some(r=>r.some(v=>typeof v==='string'&&v.startsWith('='))))throw Error(title+' 含公式，不能覆寫。');
 }
 const employeeRows=batch.valueRanges[found.length].values||[],header=employeeRows[0]||[];
 if(employeeRows.length>=1001||!(['員工代碼','姓名','啟用'].every((v,i)=>header[i]===v)||['employeeId','displayName','active'].every((v,i)=>header[i]===v)))throw Error('員工欄位或資料範圍不正確。');
 const employees={hash:waHash_(employeeRows),list:employeeRows.slice(1).filter(r=>r[2]===true).map(r=>({id:r[0],name:r[1]}))};
 if(new Set(employees.list.map(e=>e.id)).size!==employees.list.length||employees.list.some(e=>!e.id||!e.name||[e.id,e.name].some(v=>typeof v!=='string'||v.startsWith('='))))throw Error('員工代碼或姓名不正確。');
 return {map,raw,employees,parsed:waParse_(raw.weekly,raw.exceptions),hash:waHash_(raw),ids:(meta.sheets||[]).map(s=>s.properties.sheetId)};
}
function waEmployees_(state){return (state||waRead_()).employees;}
function getWeeklyAvailability(input){
 waAdmin_();const month=waMonth_(input?.month),s=waRead_(),employees=waEmployees_(s);
 return {month,employees:employees.list,hash:waHash_([s.hash,employees.hash]),weekly:s.parsed.weekly.filter(r=>r.date===month),exceptions:s.parsed.exceptions.filter(r=>r.date.startsWith(month+'-'))};
}
function waDraft_(input,employees){
 const month=waMonth_(input.month),e=employees.find(e=>e.id===input.employeeId);if(!e)throw Error('員工未啟用或不存在。');
 if(!Array.isArray(input.weekly)||input.weekly.length!==7)throw Error('請完成星期一至日。');
 const weekly=input.weekly.map((shifts,i)=>{if(!Array.isArray(shifts)||shifts.length!==3||shifts.some(v=>typeof v!=='boolean'))throw Error('請勾選每週可上班時段。');return [month,e.id,e.name,i+1,...shifts];});
 if(!Array.isArray(input.exceptions)||input.exceptions.length>31)throw Error('特殊日期格式不正確。');
 const exceptions=input.exceptions.map(r=>{if(!waDates_(month).includes(r.date)||!Array.isArray(r.shifts)||r.shifts.length!==3||r.shifts.some(v=>typeof v!=='boolean'))throw Error('特殊日期需在所選月份內。');return [r.date,e.id,e.name,...r.shifts];}).sort((a,b)=>a[0].localeCompare(b[0]));
 waParse_(weekly,exceptions);return {month,employeeId:e.id,name:e.name,weekly,exceptions};
}
function previewWeeklyAvailability(input){
 waAdmin_();const s=waRead_(),es=waEmployees_(s),hash=waHash_([s.hash,es.hash]);if(input?.hash!==hash)throw Error('資料已更新，請重新讀取再預覽。');
 const draft=waDraft_(input,es.list),token=Utilities.getUuid();CacheService.getUserCache().put('wa:'+token,JSON.stringify({hash,draft}),600);
 return {token,draft,before:{weekly:s.raw.weekly.filter(r=>r[0]===draft.month&&r[1]===draft.employeeId),exceptions:s.raw.exceptions.filter(r=>r[0].startsWith(draft.month+'-')&&r[1]===draft.employeeId)}};
}
function waRows_(state,draft,stamp,actor){
 return {weekly:[...state.raw.weekly.filter(r=>!(r[0]===draft.month&&r[1]===draft.employeeId)),...draft.weekly.map(r=>[...r,stamp,actor])],exceptions:[...state.raw.exceptions.filter(r=>!(r[0].startsWith(draft.month+'-')&&r[1]===draft.employeeId)),...draft.exceptions.map(r=>[...r,stamp,actor])]};
}
function applyWeeklyAvailability(input){
 const actor=waAdmin_();if(input?.confirmed!==true||!/^[-\w]{20,80}$/.test(input.token||''))throw Error('請先預覽並確認。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後再試。');
 try{
  waAdmin_();const cache=CacheService.getUserCache(),key='wa:'+input.token,json=cache.get(key);if(!json)throw Error('預覽已到期或已送出，請重新讀取。');
  const {hash,draft}=JSON.parse(json),s=waRead_(),es=waEmployees_(s);if(hash!==waHash_([s.hash,es.hash]))throw Error('資料已更新，請重新預覽。');
  if(!es.list.some(e=>e.id===draft.employeeId&&e.name===draft.name))throw Error('員工資料已變更。');
  const rows=waRows_(s,draft,new Date().toISOString(),actor.email),requests=[],ids=new Set(s.ids);waParse_(rows.weekly,rows.exceptions);
  for(const kind of ['weekly','exceptions']){
   const width=WA_HEADERS_[kind].length,p=s.map[kind];if(!p)throw Error('缺少可上班設定工作表，請先完成安裝。');
   if(rows[kind].length>=10000)throw Error('資料已達上限，請先封存。');
   let backupId=1;while(ids.has(backupId))backupId++;ids.add(backupId);
   requests.push({duplicateSheet:{sourceSheetId:p.sheetId,newSheetId:backupId,newSheetName:'時段備份_'+kind+'_'+input.token.slice(0,8)}});
   requests.push({updateSheetProperties:{properties:{sheetId:backupId,hidden:true},fields:'hidden'}});
   const end=Math.max(s.raw[kind].length,rows[kind].length)+1;if(end>p.gridProperties.rowCount)requests.push({appendDimension:{sheetId:p.sheetId,dimension:'ROWS',length:end-p.gridProperties.rowCount}});
   if(end>1)requests.push({updateCells:{range:{sheetId:p.sheetId,startRowIndex:1,endRowIndex:end,startColumnIndex:0,endColumnIndex:width},rows:rows[kind].map(r=>({values:Array.from({length:width},(_,i)=>cellValue(r[i]??''))})),fields:'userEnteredValue'}});
  }
  const fresh=waRead_();if(fresh.hash!==s.hash||fresh.employees.hash!==es.hash)throw Error('送出前資料已更新，請重新預覽。');cache.remove(key);
  try{Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);}catch(e){throw Error('儲存結果未確認，請重新讀取核對，勿重複送出。');}
  const check=waRead_();if(JSON.stringify(check.raw)!==JSON.stringify(rows))throw Error('寫入已送出但讀回不符，請重新讀取並檢查時段備份。');
  return {ok:true,month:draft.month,employeeId:draft.employeeId};
 }finally{lock.releaseLock();}
}
// Only availability windows are replaced. Leave, forced shifts, locks and safety limits remain.
function waOverlay_(tables,parsed,month){
 const dates=waDates_(month),out={...tables},owned=new Map();
 for(const date of dates){const weekday=new Date(date+'T00:00:00Z').getUTCDay()||7;
  for(const r of parsed.weekly.filter(r=>r.date===month&&r.weekday===weekday))owned.set(r.employeeId+'|'+date,{...r,date});
  for(const r of parsed.exceptions.filter(r=>r.date===date))owned.set(r.employeeId+'|'+date,r);
 }
 if(!owned.size)return out;
 const editable=r=>['AVAILABLE','UNAVAILABLE','OFF'].includes(r.conditionType),active=(r,d)=>(!r.validFrom||r.validFrom<=d)&&(!r.validTo||r.validTo>=d);
 out.EmployeeAvailability=(tables.EmployeeAvailability||[]).filter(r=>!(editable(r)&&owned.has(r.employeeId+'|'+r.date)&&active(r,r.date)));
 out.RecurringAvailability=[];
 for(const r of tables.RecurringAvailability||[]){
  if(!editable(r)||!dates.some(d=>owned.has(r.employeeId+'|'+d))){out.RecurringAvailability.push(r);continue;}
  for(const d of dates)if(active(r,d)&&+r.weekday===(new Date(d+'T00:00:00Z').getUTCDay()||7)&&!owned.has(r.employeeId+'|'+d))out.EmployeeAvailability.push({...r,date:d,weekday:'',availabilityId:'WA-LEGACY-'+r.recurringId+'-'+d});
 }
 for(const r of owned.values())for(let i=0;i<3;i++)out.EmployeeAvailability.push({availabilityId:'WA-'+r.employeeId+'-'+r.date+'-'+'ABC'[i],employeeId:r.employeeId,date:r.date,shiftId:'ABC'[i],conditionType:r.shifts[i]?'AVAILABLE':'UNAVAILABLE',isHard:true,source:'每週可上班設定',approvalStatus:'APPROVED',validFrom:r.date,validTo:r.date,version:1});
 return out;
}
function waSuggestionOverlay_(tables,month){
 if(!tables._weeklyAvailability)return tables;
 const names={EmployeeAvailability:'指定日期可排時段',RecurringAvailability:'每週固定可排時段'},canonical={};
 for(const [key,title]of Object.entries(names)){const rows=tables[title]||[],keys=canonicalFormHeaders_(key,rows[0]||[]);canonical[key]=rows.slice(1).filter(r=>r[0]).map(r=>Object.fromEntries(keys.map((k,i)=>[k,r[i]??''])));}
 const resolved=waOverlay_(canonical,tables._weeklyAvailability,month),out={...tables};
 for(const [key,title]of Object.entries(names)){const head=tables[title][0],keys=canonicalFormHeaders_(key,head);out[title]=[head,...resolved[key].map(r=>keys.map(k=>r[k]??''))];}return out;
}
// Installed after existing engines so all preview/publish/statistics paths share the same snapshot.
const waBaseAutoSnapshot_=autoSnapshot_;
autoSnapshot_=function(month,mode){const snap=waBaseAutoSnapshot_(month,mode);if(mode==='acceptance')return snap;const state=waRead_();snap.input.tables=waOverlay_(snap.input.tables,state.parsed,month);snap.raw._weeklyAvailability=state.raw;snap.fingerprint=waHash_([snap.fingerprint,state.raw]);return snap;};
const waBaseSuggestionSnapshot_=suggestionSnapshot_;
suggestionSnapshot_=function(){const snap=waBaseSuggestionSnapshot_(),state=waRead_();snap.tables._weeklyAvailability=state.parsed;snap.fingerprint=waHash_([snap.fingerprint,state.raw]);return snap;};
const waBaseBuildSuggestion_=buildScheduleSuggestion_;
buildScheduleSuggestion_=function(tables,month,mode){return waBaseBuildSuggestion_(waSuggestionOverlay_(tables,month),month,mode);};
const waBaseMenu_=getMenuSection;
getMenuSection=function(section){const result=waBaseMenu_(section);result.links=result.links.filter(l=>l.name!=='RecurringAvailability').map(l=>l.name==='EmployeeAvailability'?{...l,label:'每週可上班時段與特殊日期'}:l);return result;};
