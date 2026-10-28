// Administrator-only, server-held preview; never trust client-provided assignments.
const SUGGESTION_TABS_ = ['員工基本資料','班別時間設定','日曆設定','每日班別人力需求','班別資格需求','員工資格與技能','員工排班偏好','指定日期可排時段','每週固定可排時段','請假申請','員工搭班規則','班別銜接規則','排班鎖定設定','指定班別','跨月資料完整性','法規政策設定','員工設定歷程','排班控制','允許班別組合','組合優先設定','班別優先人員','個人假日設定','統計與檢查規則','月班表','每月工時標準'];
function suggestionAdmin_(){const m=requireMember_();if(m.role!=='管理者')throw Error('僅管理者可以產生或套用建議班表。');return m;}
function suggestionDigest_(value){return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value)));}
function suggestionSnapshot_(){
 const meta=readSheets_(()=>Sheets.Spreadsheets.get(ACCESS_SHEET_ID,{fields:'sheets(properties)'}));
 const sheets=SUGGESTION_TABS_.map(n=>{const p=(meta.sheets||[]).find(s=>s.properties.title===n)?.properties;if(!p)throw Error('缺少排班參數工作表：'+n);return p;});
 const ranges=sheets.map(p=>"'"+p.title+"'!A1:"+(p.title==='月班表'?'AJ':String.fromCharCode(64+Math.min(26,p.gridProperties.columnCount)))+Math.min(1001,p.gridProperties.rowCount));
 const result=readSheets_(()=>Sheets.Spreadsheets.Values.batchGet(ACCESS_SHEET_ID,{ranges,valueRenderOption:'UNFORMATTED_VALUE',dateTimeRenderOption:'FORMATTED_STRING'}));
 if(result.valueRanges?.length!==ranges.length)throw Error('排班參數未完整讀取。');
 const tables={};result.valueRanges.forEach((r,i)=>{const values=(r.values||[]).map(row=>row.slice());while(values.length>1&&values[values.length-1].every(v=>v===''||v===false||v==null))values.pop();tables[sheets[i].title]=values;if(values.length>=1000)throw Error(sheets[i].title+'超過目前支援的資料範圍。');});
 const expected=['年月','員工代碼','姓名',...Array.from({length:31},(_,i)=>String(i+1)),'總工時','資料狀態'];
 if(expected.some((s,i)=>String(tables['月班表'][0]?.[i])!==s))throw Error('月班表欄位格式不符。');
 return {tables,sheets,fingerprint:suggestionDigest_(tables)};
}
function previewScheduleSuggestion(input){
 suggestionAdmin_();input=input||{};
 const snap=suggestionSnapshot_(),result=buildScheduleSuggestion_(snap.tables,String(input.month||''),input.mode||'fill');
 if(result.canApply){const token=Utilities.getUuid(),draft={month:result.month,mode:result.mode,fingerprint:snap.fingerprint,engine:SUGGESTION_ENGINE_VERSION_,outputHash:suggestionDigest_(result.employees)};CacheService.getUserCache().put('schedule-suggestion:'+token,JSON.stringify(draft),1200);result.token=token;}
 result.expiresInMinutes=20;return result;
}
function applyScheduleSuggestion(input){
 suggestionAdmin_();if(!input||input.confirmed!==true||typeof input.token!=='string'||!/^[\w-]{20,80}$/.test(input.token))throw Error('請先產生建議並勾選確認。');
 const lock=LockService.getScriptLock();if(!lock.tryLock(10000))throw Error('有人正在儲存，請稍後重新產生建議。');
 try{
  suggestionAdmin_();const cache=CacheService.getUserCache(),key='schedule-suggestion:'+input.token,cached=cache.get(key);if(!cached)throw Error('建議已到期或已送出，請重新讀取班表後產生建議。');
  const draft=JSON.parse(cached),snap=suggestionSnapshot_();
  if(draft.engine!==SUGGESTION_ENGINE_VERSION_||draft.fingerprint!==snap.fingerprint)throw Error('Sheet 參數或班表已變更，請重新產生建議。');
  const result=buildScheduleSuggestion_(snap.tables,draft.month,draft.mode);if(!result.canApply)throw Error('重新檢查未通過，請重新產生建議查看原因。');
  if(suggestionDigest_(result.employees)!==draft.outputHash)throw Error('重新計算結果與預覽不同，請重新產生建議。');
  const p=snap.sheets.find(p=>p.title==='月班表'),raw=snap.tables['月班表'];
  // Do not overwrite formulas or a concurrently moved row.
  const formula=readSheets_(()=>Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID,"'月班表'!A1:AJ1001",{valueRenderOption:'FORMULA'})).values||[];
  const requests=[],targets=[];let next=raw.length;
  for(const e of result.employees){let row=raw.findIndex(r=>r[0]===draft.month&&r[1]===e.id);if(row<0)row=next++;
   if(row>=1000)throw Error('班表已達資料列上限。');
   if(formula[row]?.some(v=>typeof v==='string'&&v.startsWith('=')))throw Error('目標班表含公式，為保護公式不予覆寫。');
   const values=[draft.month,e.id,e.name,...e.days,...Array(31-e.days.length).fill(''),e.hours,'規則建議已確認'];targets.push({row,values});
  }
  // Re-read all inputs immediately before commit. Direct external Sheet edits are not locked by GAS.
  if(suggestionSnapshot_().fingerprint!==snap.fingerprint)throw Error('套用前資料已變更，請重新產生建議。');
  const backupId=Number.parseInt(Utilities.getUuid().replace(/-/g,'').slice(0,7),16),title='建議前備份_'+draft.month+'_'+input.token.slice(0,8);
  requests.push({duplicateSheet:{sourceSheetId:p.sheetId,newSheetId:backupId,newSheetName:title}});
  if(next>p.gridProperties.rowCount)requests.push({appendDimension:{sheetId:p.sheetId,dimension:'ROWS',length:next-p.gridProperties.rowCount}});
  targets.forEach(t=>requests.push({updateCells:{start:{sheetId:p.sheetId,rowIndex:t.row,columnIndex:0},rows:[{values:t.values.map(cellValue)}],fields:'userEnteredValue'}}));
  cache.remove(key); // Consume before the non-retried write, even when its outcome is unknown.
  try{Sheets.Spreadsheets.batchUpdate({requests},ACCESS_SHEET_ID);}catch(_){throw Error('套用已送出但結果未確認，請重新讀取班表並檢查備份「'+title+'」，勿重複送出。');}
  let verified;
  try{verified=getSchedule({month:draft.month,view:'all'});if(result.employees.some(e=>{const v=verified.employees.find(v=>v.id===e.id);return !v||v.hours!==e.hours||JSON.stringify(v.days)!==JSON.stringify(e.days);}))throw Error('mismatch');}
  catch(_){throw Error('已送出但讀回核對未完成，請重新讀取；套用前備份為「'+title+'」。');}
  return {ok:true,schedule:verified,backupSheet:title};
 }finally{lock.releaseLock();}
}
