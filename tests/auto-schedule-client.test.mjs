import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html=fs.readFileSync(new URL('../gas/AutoSchedule.html',import.meta.url),'utf8');
const js=html.match(/<script>([\s\S]+)<\/script>/)[1];
function fixture({rosterMonth='2026-11',now='2026-11-20T00:00:00Z'}={}){
 const all=new Map(),calls=[];
 function element(){
  const events={};
  return {children:[],dataset:{},disabled:false,checked:false,open:false,textContent:'',
   append(...n){this.children.push(...n);},prepend(...n){this.children.unshift(...n);},
   replaceChildren(...n){this.children=n;},removeAttribute(k){delete this[k];},
   addEventListener(k,f){events[k]=f;},showModal(){this.open=true;},close(){this.open=false;},
   escape(){events.cancel({preventDefault:()=>{this.prevented=true;}});if(!this.prevented)this.close();},
   querySelectorAll(){const found=[];const visit=n=>{if('demandChoice'in n.dataset)found.push(n);n.children.forEach(visit);};this.children.forEach(visit);return found;}
  };
 }
 const e=id=>{if(!all.has(id))all.set(id,element());return all.get(id);};
 e('auto-month').value='';e('auto-mode').value='production';e('auto-publish').disabled=true;
 function rpc(ok,err){const run={withSuccessHandler:f=>rpc(f,err),withFailureHandler:f=>rpc(ok,f)};for(const method of ['getCurrentMember','getAutoDemandSheetLink','previewAutoSchedule','publishAutoSchedule','getAutoDemandReview'])run[method]=args=>calls.push({method,args,ok,err});return run;}
 const ctx={document:{getElementById:e,createElement:element},google:{script:{run:rpc()}},scheduleData:rosterMonth===null?null:{month:rosterMonth},Date:class extends Date{constructor(...args){super(...(args.length?args:[now]));}}};
 vm.runInNewContext(js,ctx);
 return {e,calls,ctx,dialog:e('auto-schedule'),last:()=>calls.at(-1),click(id){if(!e(id).disabled)e(id).onclick();},texts(id){const read=n=>[n.textContent,...n.children.flatMap(read)];return read(e(id)).filter(Boolean).join(' ');}};
}
const checked={status:'CHECKED',mode:'production'};
const ready={status:'READY',mode:'production',plan:{TEST01:{'2026-11-01':'A'}},validation:{stats:[{id:'TEST01',name:'QA',hours:4,workDays:1,hourDifference:0}]},token:'valid-token',employeeCount:1,dayCount:1};
function review(){
 return {month:'2026-11',requiresReview:true,token:'review-token',fingerprint:'snap1',rows:[
  {id:'r5',date:'2026-11-28',shift:'A',official:{min:0,ideal:0,max:0,closed:true},proposed:{min:2,ideal:7,max:7,closed:false},eligible:true},
  {id:'r6',date:'2026-11-28',shift:'B',official:null,proposed:null,eligible:false,reason:'來源不明，不能採用'}]};
}
test('missing callback allows Close; old success and failure cannot replace a newer result',()=>{
 const f=fixture();f.click('auto-launch');f.click('auto-check');const old=f.last();
 assert.equal(old.method,'previewAutoSchedule');assert.equal(old.args.checkOnly,true);
 assert.equal(f.e('auto-close').disabled,false);assert.equal(f.e('auto-check').disabled,true);
 f.click('auto-close');assert.equal(f.dialog.open,false);
 f.click('auto-launch');assert.match(f.texts('auto-message'),/可能仍在背景完成/);f.click('auto-check');const next=f.last();
 old.ok(ready);old.err(Error('stale'));assert.match(f.texts('auto-message'),/正在讀取/);assert.equal(f.e('auto-check').disabled,true);
 next.ok(checked);assert.match(f.texts('auto-message'),/輸入檢查通過/);assert.equal(f.e('auto-check').disabled,false);
 old.ok(ready);assert.match(f.texts('auto-message'),/輸入檢查通過/);assert.equal(f.e('auto-confirm-area').hidden,true);
});
test('Escape detaches search; actual confirmed publication remains locked until callback',()=>{
 const f=fixture();f.click('auto-launch');f.e('auto-reviewed').checked=true;
 f.click('auto-preview');const old=f.last();f.dialog.escape();assert.equal(f.dialog.open,false);
 old.ok(ready);f.click('auto-launch');f.click('auto-preview');f.last().ok(ready);
 f.e('auto-confirm').checked=true;f.e('auto-confirm').onchange();f.click('auto-publish');const published=f.last();
 assert.equal(published.method,'publishAutoSchedule');assert.equal(f.e('auto-close').disabled,true);
 f.dialog.escape();f.click('auto-close');f.click('auto-publish');assert.equal(f.dialog.open,true);
 assert.equal(f.calls.filter(r=>r.method==='publishAutoSchedule').length,1);
 published.ok({sheetUrl:'https://example.invalid',employeeCount:1,hours:4,version:'QA'});
 assert.match(f.texts('auto-message'),/讀回核對成功/);f.click('auto-close');assert.equal(f.dialog.open,false);
});
test('show old vs proposed including zero, only explicitly chosen valid rows enter preview',()=>{
 const f=fixture();f.click('auto-launch');f.click('auto-demand-read');const req=f.last();
 assert.equal(req.method,'getAutoDemandReview');assert.equal(req.args.month,'2026-11');req.ok(review());
 assert.match(f.texts('auto-demand-rows'),/休診｜最低 0／理想 0／最高 0/);assert.match(f.texts('auto-demand-rows'),/開診｜最低 2／理想 7／最高 7/);
 assert.match(f.texts('auto-demand-rows'),/來源不明，不能採用/);
 const choices=f.e('auto-demand-rows').querySelectorAll();assert.equal(choices.length,1);
 f.click('auto-check');assert.equal(f.last(),req);assert.match(f.texts('auto-message'),/請先明確覆核/);
 f.click('auto-demand-baseline');f.click('auto-check');assert.deepEqual(JSON.parse(JSON.stringify(f.last().args.demandReview)),{token:'review-token',fingerprint:'snap1',action:'baseline',selectedIds:[]});f.last().ok(checked);
 choices[0].checked=true;choices[0].onchange();f.click('auto-demand-apply');f.click('auto-check');
 assert.deepEqual(JSON.parse(JSON.stringify(f.last().args.demandReview)),{token:'review-token',fingerprint:'snap1',action:'apply',selectedIds:['r5']});
 assert.equal(f.calls.some(r=>r.method==='publishAutoSchedule'),false);
});
test('mode or month invalidates cached review and read exit ignores late demand result',()=>{
 const f=fixture();f.click('auto-launch');f.click('auto-demand-read');const old=f.last();
 f.dialog.escape();old.ok(review());assert.equal(f.e('auto-demand-actions').hidden,true);
 f.click('auto-launch');f.click('auto-demand-read');f.last().ok(review());f.click('auto-demand-baseline');
 f.e('auto-month').value='2026-12';f.e('auto-month').onchange();assert.equal(f.e('auto-demand-actions').hidden,true);
 f.click('auto-check');assert.equal(f.last().args.month,'2026-12');assert.equal('demandReview'in f.last().args,false);f.last().ok(checked);
 f.e('auto-mode').value='acceptance';f.e('auto-mode').onchange();assert.equal(f.e('auto-demand-review').hidden,true);
 f.click('auto-check');assert.equal(f.last().args.mode,'acceptance');assert.equal('demandReview'in f.last().args,false);
});
test('the generated portal carries the exact current auto-scheduling script',()=>{
 const gas=fs.readFileSync(new URL('../gas/Portal.gs',import.meta.url),'utf8');
 const portal=JSON.parse(gas.match(/^const PORTAL_HTML_ = (.*);$/m)[1]);
 assert.ok(portal.includes(html));
 assert.match(portal,/班表查閱與工時統計 · 管理者可預覽自動排班/);
 assert.doesNotMatch(portal,/自動排班尚未啟用/);
});

test('first actual launch prefers already rendered roster month and does not prefetch November',()=>{
 const f=fixture({rosterMonth:'2026-12'});
 f.last().ok({role:'管理者'});assert.equal(f.calls.filter(c=>c.method==='getAutoDemandSheetLink').length,0);
 f.click('auto-launch');assert.equal(f.e('auto-month').value,'2026-12');
 assert.equal(f.last().method,'getAutoDemandSheetLink');assert.equal(f.last().args.month,'2026-12');
 f.click('auto-check');assert.equal(f.last().args.month,'2026-12');
});

test('when no valid roster is loaded, Taipei month changes at Taiwan midnight and year boundary',()=>{
 for(const [now,expected] of [['2026-11-30T15:59:59Z','2026-11'],['2026-11-30T16:00:00Z','2026-12'],['2026-12-31T15:59:59Z','2026-12'],['2026-12-31T16:00:00Z','2027-01']]){
  for(const rosterMonth of [null,'2026-13']){
   const f=fixture({rosterMonth,now});f.e('schedule-month').value='2026-11';f.click('auto-launch');
   assert.equal(f.e('auto-month').value,expected);assert.equal(f.last().args.month,expected);
  }
 }
});

test('reopen and mode changes preserve manual month and explicitly cleared value',()=>{
 const f=fixture({rosterMonth:'2026-12'});f.click('auto-launch');
 f.e('auto-month').value='2027-02';f.e('auto-month').onchange();
 const older=f.last();f.click('auto-close');f.ctx.scheduleData={month:'2027-05'};
 f.click('auto-launch');assert.equal(f.e('auto-month').value,'2027-02');assert.equal(f.last(),older);
 f.e('auto-month').value='';f.e('auto-month').onchange();f.click('auto-close');
 f.e('auto-mode').value='acceptance';f.e('auto-mode').onchange();
 f.click('auto-launch');older.ok({month:'2027-02',url:'https://example.invalid/stale'});
 assert.equal(f.e('auto-month').value,'');assert.equal(f.e('auto-fill').hidden,true);assert.equal(f.e('auto-fill').href,undefined);
});

test('reopen follows a newly loaded roster month until explicitly chosen; previous approval is discarded',()=>{
 const f=fixture({rosterMonth:'2026-11'});f.click('auto-launch');const oldLink=f.last();
 f.click('auto-demand-read');f.last().ok(review());f.click('auto-demand-baseline');
 f.e('auto-reviewed').checked=true;f.click('auto-preview');f.last().ok(ready);
 f.e('auto-confirm').checked=true;f.e('auto-confirm').onchange();
 assert.equal(f.e('auto-publish').disabled,false);
 f.click('auto-close');f.ctx.scheduleData={month:'2026-12'};f.click('auto-launch');
 assert.equal(f.e('auto-month').value,'2026-12');const newLink=f.last();
 assert.equal(newLink.method,'getAutoDemandSheetLink');assert.equal(newLink.args.month,'2026-12');
 oldLink.ok({url:'https://example.invalid/stale'});assert.equal(f.e('auto-fill').hidden,true);
 assert.equal(f.e('auto-reviewed').checked,false);assert.equal(f.e('auto-confirm').checked,false);
 assert.equal(f.e('auto-confirm-area').hidden,true);assert.equal(f.e('auto-demand-actions').hidden,true);
 assert.equal(f.e('auto-publish').disabled,true);assert.equal(f.e('auto-results').children.length,0);
 f.click('auto-check');assert.equal(f.last().args.month,'2026-12');
 assert.equal('demandReview' in f.last().args,false);
});
