import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateTemplate} from '../scripts/check-template.mjs';
const source=JSON.parse(await readFile(new URL('../templates/2026-11.json',import.meta.url),'utf8'));
test('November template has 10 placeholders and 90 unique date-shifts',()=>assert.deepEqual(validateTemplate(source),[]));
test('missing is distinct from an explicit zero',()=>{
  const x=structuredClone(source);x.tables.DailyShiftDemands[0].requiredHeadcount=0;x.tables.DailyShiftDemands[0].MaxStaff=0;
  assert.deepEqual(validateTemplate(x),[]);
  assert.equal(source.tables.DailyShiftDemands[0].requiredHeadcount,null);
});
test('reject demand above maximum',()=>{
  const x=structuredClone(source);Object.assign(x.tables.DailyShiftDemands[0],{requiredHeadcount:3,MaxStaff:2});
  assert.ok(validateTemplate(x).includes('DEMAND_EXCEEDS_MAX'));
});
test('reject duplicated date-shift even with 90 rows',()=>{
  const x=structuredClone(source);x.tables.DailyShiftDemands[1]=x.tables.DailyShiftDemands[0];
  assert.ok(validateTemplate(x).includes('DEMAND_COVERAGE'));
});
test('reject invalid dates and negative headcounts',()=>{
  const x=structuredClone(source);Object.assign(x.tables.DailyShiftDemands[0],{date:'2026-11-31',MaxStaff:-1});
  assert.ok(validateTemplate(x).includes('DEMAND_COVERAGE'));assert.ok(validateTemplate(x).includes('INVALID_MAX_STAFF'));
});
test('do not invent holidays, rest policy, or rule 47',()=>{
  const x=structuredClone(source);x.tables.CalendarDates[0].isNationalHoliday=false;
  x.tables.SystemConfig.find(r=>r.key==='DUPLICATE_SAME_MONTH_TASK_PRODUCT_POLICY').value='QUEUE';
  assert.ok(validateTemplate(x).includes('UNCONFIRMED_CALENDAR'));assert.ok(validateTemplate(x).includes('RULE_47_NOT_CONFIRMED'));
});
test('cannot call an input template production-ready',()=>{
  const x=structuredClone(source);x.productionReady=true;assert.ok(validateTemplate(x).includes('NOT_TEMPLATE'));
});
test('all 30 table contracts exist, record fields match and operational tables are empty',async()=>{
  const schema=JSON.parse(await readFile(new URL('../schemas/tables.json',import.meta.url),'utf8'));
  assert.equal(Object.keys(schema.tables).length,30);
  assert.deepEqual(Object.keys(source.tables).sort(),Object.keys(schema.tables).sort());
  for(const [name,contract] of Object.entries(schema.tables)){
    for(const row of source.tables[name]) assert.deepEqual(Object.keys(row).sort(),contract.fields.toSorted());
    if(contract.purpose==='SYSTEM_GENERATED') assert.equal(source.tables[name].length,0);
  }
});
