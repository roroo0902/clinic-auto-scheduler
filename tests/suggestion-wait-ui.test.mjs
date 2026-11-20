import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../gas/Suggestions.html',import.meta.url),'utf8');
function fixture(){
 const calls=[],nodes=new Map();
 const node=tag=>({tag,disabled:false,closed:true,children:[],value:'2026-11',textContent:'',append(...items){this.children.push(...items);},replaceChildren(){this.children=[];},addEventListener(k,f){this[k]=f;},showModal(){this.closed=false;},close(){this.closed=true;}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,node(id));return nodes.get(id);};
 const find=()=>get('host');
 const run=(ok,err)=>new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return f=>run(f,err);if(name==='withFailureHandler')return f=>run(ok,f);return args=>calls.push({name,ok,err,args});}});
 vm.runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],{document:{getElementById:get,createElement:node,querySelector:find},google:{script:{run:run()}}});
 calls.at(-1).ok({role:'管理者'});
 const dialog=get('suggestion-dialog');
 return {get,calls,dialog,open:()=>find().children[0].onclick(),click:id=>{if(!get(id).disabled)get(id).onclick();},current:()=>calls.at(-1),esc:()=>{let prevented=false;dialog.cancel({preventDefault(){prevented=true;}});if(!prevented)dialog.close();}};
}
const ready={ready:true,canApply:true,token:'qa-token',issues:[],warnings:[]};
for(const via of ['close','escape'])test('pending read exits by '+via+' and late replies cannot change reopened work',()=>{
 const f=fixture();f.open();f.click('sg-generate');const old=f.current();assert.equal(old.name,'previewScheduleSuggestion');
 assert.equal(f.get('sg-close').disabled,false);assert.match(f.get('sg-status').textContent,/不會寫入班表/);
 if(via==='close')f.click('sg-close');else f.esc();assert.equal(f.dialog.closed,true);
 f.open();f.click('sg-generate');const fresh=f.current();assert.notEqual(fresh,old);
 old.err(Error('old failure'));old.ok(ready);assert.match(f.get('sg-status').textContent,/正在讀取/);assert.equal(f.get('sg-generate').disabled,true);
 fresh.ok({...ready,canApply:false});assert.match(f.get('sg-status').textContent,/不可套用/);
 old.err(Error('old late failure'));old.ok(ready);assert.match(f.get('sg-status').textContent,/不可套用/);assert.equal(f.get('sg-approval').hidden,true);
 assert.equal(f.calls.filter(r=>r.name==='applyScheduleSuggestion').length,0);
});
test('actual apply remains close-locked and cannot be resubmitted during the write',()=>{
 const f=fixture();f.open();f.click('sg-generate');f.current().ok(ready);
 f.get('sg-confirm').checked=true;f.get('sg-confirm').onchange();f.click('sg-apply');const apply=f.current();assert.equal(apply.name,'applyScheduleSuggestion');
 f.click('sg-close');f.esc();f.click('sg-apply');assert.equal(f.dialog.closed,false);assert.equal(f.calls.filter(r=>r.name==='applyScheduleSuggestion').length,1);
 apply.err(Error('unknown'));assert.match(f.get('sg-status').textContent,/重新讀取正式班表/);f.click('sg-close');assert.equal(f.dialog.closed,true);
});
test('fresh build embeds exact suggestions source',()=>{
 const source=fs.readFileSync(new URL('../gas/Portal.gs',import.meta.url),'utf8');
 const portal=JSON.parse(source.match(/^const PORTAL_HTML_ = (.*);$/m)[1]);assert.ok(portal.includes(html));
});
