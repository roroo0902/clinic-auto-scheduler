// Explicitly fictional acceptance fixture. Never merged into production inputs.
function autoFixture_(month){
 month=month||'2030-11';const dates=Array.from({length:new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate()},(_,i)=>month+'-'+String(i+1).padStart(2,'0'));
 const t={Employees:Array.from({length:17},(_,i)=>({employeeId:'TEST'+String(i+1).padStart(2,'0'),displayName:'驗收人員'+String(i+1).padStart(2,'0'),active:true,maxDailyHours:8,maxWeeklyHours:40,maxConsecutiveDays:6,maxWeeklyWorkDays:6,minRestHours:10,targetMonthlyHours:40})),
 ShiftDefinitions:[{shiftId:'A',startTime:'08:00',endTime:'12:00'},{shiftId:'B',startTime:'14:30',endTime:'18:30'},{shiftId:'C',startTime:'18:30',endTime:'21:30'}].map(s=>({...s,endDayOffset:0,unpaidBreakMinutes:0})),
 CalendarDates:dates.map(date=>({date,isOperatingDay:true,isNationalHoliday:false})),
 DailyShiftDemands:dates.flatMap(date=>[...'ABC'].map(shiftId=>({date,shiftId,requiredHeadcount:2,MaxStaff:3,idealHeadcount:2,isClosed:false}))),
 AllowedShifts:['A','B','C','AB','AC','BC','ABC'].map(combination=>({employeeId:'ALL',combination,allowed:true})),CrossMonthCoverage:[]};
 for(const e of t.Employees)for(let day=autoDay_(dates[0])-7;day<=autoDay_(dates[dates.length-1])+7;day++){const date=autoIso_(day);if(!date.startsWith(month))t.CrossMonthCoverage.push({employeeId:e.employeeId,date,coverageStatus:'REST',sourceScheduleVersionId:'FICTIONAL_ACCEPTANCE_ONLY',verifiedBy:'FICTIONAL_FIXTURE'});}
 t.ForcedShifts=t.Employees.map((e,i)=>({employeeId:e.employeeId,date:dates[i],shiftId:'A'}));
 return {month,tables:t,weekStart:1,existing:{},issues:[]};
}

