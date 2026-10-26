import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../gas/Access.gs',import.meta.url),'utf8');
const header=['Google 信箱','顯示名稱','角色','啟用','備註'];
const member=['member@example.com','Member','一般使用者',true,''];
function runtime(rows=[header,member],email='member@example.com',effective=email){
 const ctx={Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=>effective})},Sheets:{Spreadsheets:{Values:{get:()=>({values:rows})}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
test('enabled Google identity is accepted; normalizes email',()=>assert.equal(runtime(undefined,'MEMBER@example.com').getCurrentMember().role,'一般使用者'));
test('blank or different execution identity is refused',()=>{assert.throws(()=>runtime(undefined,'').getCurrentMember());assert.throws(()=>runtime(undefined,'member@example.com','owner@example.com').getCurrentMember());});
test('unlisted, disabled, duplicate and invalid roles are refused',()=>{
 for(const rows of [[header],[header,[...member.slice(0,3),false,'']],[header,member,member],[header,[member[0],'Name','owner',true,'']]])assert.throws(()=>runtime(rows).getCurrentMember());
});
test('string true and malformed headers cannot enable an account',()=>{assert.throws(()=>runtime([header,[...member.slice(0,3),'TRUE','']]).getCurrentMember());assert.throws(()=>runtime([['email'],member]).getCurrentMember());});
test('every request rereads roster; revoked member cannot get links',()=>{const rows=[header,[...member]],ctx=runtime(rows);assert.ok(ctx.getMenuSection('battle').links.length);rows[1][3]=false;assert.throws(()=>ctx.getMenuSection('battle'));});
test('only administrators receive administrative menu links',()=>{assert.ok(!runtime().getMenuSection('other').links.some(l=>l.name==='登入授權名單'));const rows=[header,[member[0],'Admin','管理者',true,'']];assert.ok(runtime(rows).getMenuSection('other').links.some(l=>l.name==='登入授權名單'));});
test('arbitrary/prototype menu and missing sheet fail closed',()=>{assert.throws(()=>runtime().getMenuSection('__proto__'));const ctx=runtime();ctx.Sheets.Spreadsheets.Values.get=()=>{throw Error('Permission denied');};assert.throws(()=>ctx.getCurrentMember());});

