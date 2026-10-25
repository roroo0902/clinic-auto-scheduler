import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export function validateTemplate(data) {
  const errors=[];
  const check=(ok,code)=>{if(!ok) errors.push(code);};
  check(data.artifactType==='INPUT_TEMPLATE' && data.productionReady===false,'NOT_TEMPLATE');
  check(data.month==='2026-11','MONTH');
  check(data.timezone==='Asia/Taipei','TIMEZONE');
  const tables=data.tables || {};
  const employees=tables.Employees || [];
  check(employees.length===10,'EMPLOYEE_SLOT_COUNT');
  check(new Set(employees.map(e=>e.employeeId)).size===employees.length,'DUPLICATE_EMPLOYEE');
  check(employees.every(e=>e.displayName===null && e.active===null),'TEMPLATE_CONTAINS_EMPLOYEE_DATA');
  const dates=Array.from({length:30},(_,i)=>`2026-11-${String(i+1).padStart(2,'0')}`);
  const expected=new Set(dates.flatMap(d=>['A','B','C'].map(s=>`${d}/${s}`)));
  const demands=tables.DailyShiftDemands || [];
  const keys=demands.map(d=>`${d.date}/${d.shiftId}`);
  check(keys.length===90 && new Set(keys).size===90 && keys.every(k=>expected.has(k)),'DEMAND_COVERAGE');
  for (const d of demands) {
    check(d.requiredHeadcount===null || Number.isInteger(d.requiredHeadcount)&&d.requiredHeadcount>=0,'INVALID_DEMAND');
    check(d.MaxStaff===null || Number.isInteger(d.MaxStaff)&&d.MaxStaff>=0,'INVALID_MAX_STAFF');
    check(d.requiredHeadcount===null || d.MaxStaff===null || d.requiredHeadcount<=d.MaxStaff,'DEMAND_EXCEEDS_MAX');
  }
  const calendar=tables.CalendarDates || [];
  check(calendar.length===30 && new Set(calendar.map(d=>d.date)).size===30 && calendar.every(d=>dates.includes(d.date)),'CALENDAR_COVERAGE');
  for(const d of calendar){
    const weekday=new Date(`${d.date}T00:00:00Z`).getUTCDay();
    check(d.weekday===(weekday || 7),'WRONG_WEEKDAY');
    check(d.weekendFlag===(weekday===0||weekday===6),'WRONG_WEEKEND');
    check(d.isNationalHoliday===null && d.isOperatingDay===null,'UNCONFIRMED_CALENDAR');
  }
  const shiftTimes={A:['08:00','12:00'],B:['14:30','18:30'],C:['18:30','21:30']};
  const shifts=tables.ShiftDefinitions || [];
  check(shifts.length===3 && new Set(shifts.map(s=>s.shiftId)).size===3,'SHIFT_COUNT');
  for(const s of shifts) check(shiftTimes[s.shiftId]?.[0]===s.startTime && shiftTimes[s.shiftId]?.[1]===s.endTime && s.unpaidBreakMinutes===null,'SHIFT_DEFINITION');
  const view=data.scheduleView || [];
  const viewKeys=view.map(r=>`${r.date}/${r.shiftId}`);
  check(viewKeys.length===90 && new Set(viewKeys).size===90 && viewKeys.every(k=>expected.has(k)),'SCHEDULE_COVERAGE');
  check(view.every(r=>r.employeeIds?.length===0 && r.status==='UNFILLED'),'TEMPLATE_ASSIGNMENTS');
  check(data.crossMonthStatus==='MISSING_NOT_ASSUMED_REST','CROSS_MONTH_NOT_UNKNOWN');
  const config=new Map((tables.SystemConfig||[]).map(r=>[r.key,r]));
  check(config.get('SEARCH_BUDGET_SECONDS')?.value===900,'SEARCH_BUDGET');
  check(config.get('RELEASE_REQUIRES_APPROVAL')?.value===true,'APPROVAL_GATE');
  check(config.get('DUPLICATE_SAME_MONTH_TASK_PRODUCT_POLICY')?.value===null,'RULE_47_NOT_CONFIRMED');
  return [...new Set(errors)];
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const data=JSON.parse(await readFile(new URL('../templates/2026-11.json',import.meta.url),'utf8'));
  const errors=validateTemplate(data);
  if(errors.length){ console.error(errors.join('\n')); process.exitCode=1; }
  else console.log('PASS: template structure only. NOT a schedule, legal compliance, or deployment validation.');
}
