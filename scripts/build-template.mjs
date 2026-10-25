import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const month = '2026-11';
const shifts = [
  { shiftId:'A', shiftName:'早班', startTime:'08:00', endTime:'12:00' },
  { shiftId:'B', shiftName:'午班', startTime:'14:30', endTime:'18:30' },
  { shiftId:'C', shiftName:'晚班', startTime:'18:30', endTime:'21:30' }
].map(s => ({...s, endDayOffset:0, unpaidBreakMinutes:null, breakRules:null,
  hoursCalculationPolicy:null, effectiveFrom:null, effectiveTo:null, version:1}));

// These are field contracts, not database migrations or an implemented backend.
const fields = {
  SystemConfig:'key value type scope effectiveFrom effectiveTo version status',
  Employees:'employeeId displayName active department employmentType targetMonthlyHours minMonthlyRestDays maxMonthlyWorkDays maxDailyHours maxWeeklyHours maxConsecutiveDays preferredMinDailyHours validFrom validTo version',
  ShiftDefinitions:'shiftId shiftName startTime endTime endDayOffset unpaidBreakMinutes breakRules hoursCalculationPolicy effectiveFrom effectiveTo version',
  CalendarDates:'date weekday isOperatingDay isNationalHoliday weekendFlag holidayType notes calendarVersion',
  DailyShiftDemands:'demandId date shiftId requiredHeadcount MaxStaff version',
  ShiftQualificationDemands:'demandId date shiftId qualificationId minimumQualifiedCount distinctPersonRequirement version',
  EmployeeQualifications:'employeeId qualificationId qualificationName roleCategory verifiedForLegalDuty verificationSourceRef verificationAsOf validFrom validTo version',
  EmployeePreferences:'preferenceId employeeId preferenceType shiftId dayOfWeek holidayType rankOrPreference validFrom validTo version',
  EmployeeAvailability:'availabilityId employeeId date shiftId conditionType isHard source approvalStatus validFrom validTo version',
  RecurringAvailability:'recurringId employeeId weekday shiftId conditionType isHard validFrom validTo version',
  LeaveRequests:'requestId employeeId startDate endDate requestedShifts status reasonRef reviewedBy reviewedAt version',
  PairingRules:'ruleId employeeA employeeB pairingMode isHard validFrom validTo version',
  ShiftTransitions:'transitionId employeeId fromShiftId toShiftId ruleMode validFrom validTo version',
  ScheduleVersions:'scheduleVersionId yearMonth sequence status sourceTaskId parentVersionId createdBy createdAt publishedAt inputVersionHash validationStatus version',
  ScheduleAssignments:'assignmentId scheduleVersionId employeeId date shiftId startAt endAt calculatedWorkMinutes roleOrQualificationAssignment status version',
  AssignmentLocks:'lockId employeeId date shiftId locked lockedBy lockedAt reason version',
  SchedulingTasks:'taskId yearMonth requestId status stage algorithmVersion githubCommit gasDeploymentVersion configVersion inputSnapshotHash randomSeed accumulatedComputeMs evaluatedCandidateCount bestShortageCount bestHourError stopReason retryCount cancelRequested createdBy createdAt updatedAt lastError sourceScheduleVersionId',
  TaskCheckpoints:'taskId checkpointSeq schemaVersion engineVersion inputSnapshotHash serializedSolverStateRef searchMetrics createdAt integrityHash resumeAllowed',
  TaskEvents:'eventId taskId eventType stage timestamp safeMessage metricsSnapshot',
  ValidationReports:'reportId taskId scheduleVersionId ruleId severity date employeeId shiftId issueCode issueDetail resolved verifiedAt validatorVersion',
  ChangeLogs:'changeId scheduleVersionId entityType entityId beforeJson afterJson operatorId changedAt approvalRef reason',
  AuditLogs:'auditId actorId action targetId timestamp requestId resultStatus clientVersion metadataSafe',
  Notifications:'notificationId scheduleVersionId affectedEmployeeId beforeAfterSummary messageText status confirmedBy confirmedAt manuallySentAt version',
  AlgorithmComparisons:'comparisonId requestedBy oldAlgoVersion newAlgoVersion oldGitCommit newGitCommit oldGasVersion newGasVersion snapshotHash budgetMs lexicographicMetrics hardValidationResults decision createdAt',
  Backups:'backupId createdAt driveFileId sourceSpreadsheetId sourceVersion integrityInfo restorePreviewRef restoredBy restoredAt status',
  DeploymentHistory:'releaseId approvedBy approvedAt githubCommit gasScriptId gasDeploymentId gasVersion frontendBuildId testReportId rollbackTarget status',
  ForcedShifts:'forcedShiftId employeeId date shiftId source validFrom validTo version',
  CrossMonthCoverage:'employeeId date coverageStatus sourceScheduleVersionId verifiedBy verifiedAt',
  EmployeeSettingsHistory:'settingsVersionId employeeId effectiveFrom effectiveTo settingsJson sourceVersion',
  LegalPolicy:'policyId jurisdiction employmentType weeklyStartDay minRestMinutes policyJson verificationSourceRef approvedBy approvedAt effectiveFrom effectiveTo version'
};
const runtime = new Set(['ScheduleVersions','ScheduleAssignments','AssignmentLocks','SchedulingTasks','TaskCheckpoints','TaskEvents','ValidationReports','ChangeLogs','AuditLogs','Notifications','AlgorithmComparisons','Backups','DeploymentHistory','EmployeeSettingsHistory']);
const tables = Object.fromEntries(Object.keys(fields).map(k => [k, []]));
const config = (key,value,type,status='CONFIRMED') => ({key,value,type,scope:'GLOBAL',effectiveFrom:null,effectiveTo:null,version:1,status});
tables.SystemConfig = [
  config('TIMEZONE','Asia/Taipei','string'), config('TEST_MONTH',month,'string'),
  config('SEARCH_BUDGET_SECONDS',900,'integer'),
  config('OPTIMIZATION_ORDER',['HARD_CONSTRAINTS','STAFF_SHORTAGE','MONTHLY_HOURS_ERROR','QUALITY_PREFERENCES','TIE_BREAK'],'array'),
  config('RELEASE_REQUIRES_APPROVAL',true,'boolean'),
  config('ALLOWED_ROLES',['ADMIN'],'array'),
  config('AUTO_COMPARE_ALGORITHMS',false,'boolean'),
  config('STOP_ON_PROVEN_OPTIMAL',true,'boolean'),
  config('STOP_ON_APPROVED_QUALITY_THRESHOLD',true,'boolean'),
  config('QUALITY_THRESHOLD',null,'object','PENDING'),
  config('RETRY_LIMIT',null,'integer','PENDING'),
  config('PROGRESS_POLL_INTERVAL_SECONDS',null,'integer','PENDING'),
  config('BACKUP_FREQUENCY','DAILY','string'), config('BACKUP_TIME',null,'string','PENDING'),
  config('DUPLICATE_SAME_MONTH_TASK_PRODUCT_POLICY',null,'string','PENDING_RULE_47'),
  config('NOTIFICATION_MODE','MANAGER_MANUAL_SEND','string'),
  config('ADMIN_EMAILS',null,'array','PENDING_PRIVATE_CONFIG'),
  config('GOOGLE_SPREADSHEET_ID',null,'string','PENDING'),
  config('GAS_SCRIPT_ID',null,'string','PENDING'),
  config('GAS_DEPLOYMENT_ID',null,'string','PENDING'),
  config('BACKUP_FOLDER_ID',null,'string','PENDING_PRIVATE_CONFIG')
];
tables.Employees = Array.from({length:10}, (_,i) => ({
  ...Object.fromEntries(fields.Employees.split(' ').map(k => [k,null])),
  employeeId:`EMP${String(i+1).padStart(3,'0')}`, version:1
}));
tables.ShiftDefinitions = shifts;
const weekdayNames = ['日','一','二','三','四','五','六'];
const dates = Array.from({length:30}, (_,i) => `${month}-${String(i+1).padStart(2,'0')}`);
tables.CalendarDates = dates.map(date => {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return {date, weekday:day || 7, isOperatingDay:null, isNationalHoliday:null,
    weekendFlag:day===0 || day===6, holidayType:null, notes:null, calendarVersion:1};
});
tables.DailyShiftDemands = dates.flatMap(date => shifts.map(s => ({
  demandId:`DEM-${date}-${s.shiftId}`,date,shiftId:s.shiftId,requiredHeadcount:null,MaxStaff:null,version:1
})));
const schedule = tables.DailyShiftDemands.map(d => ({date:d.date,shiftId:d.shiftId,employeeIds:[],status:'UNFILLED'}));
const data = {
  schemaVersion:'0.1.0', specificationVersion:'2026-10-25',
  artifactType:'INPUT_TEMPLATE', month, timezone:'Asia/Taipei',
  productionReady:false, placeholderEmployeeIds:true,
  missingDataPolicy:'NULL_IS_UNKNOWN_NOT_ZERO',
  crossMonthStatus:'MISSING_NOT_ASSUMED_REST',
  confirmedRuleRange:[1,46], pendingRuleIds:[47],
  tables, scheduleView:schedule
};
const dictionary = {
  schemaVersion:'0.1.0', status:'DATA_CONTRACT_ONLY',
  commonAuditFields:['recordVersion','updatedAt','updatedBy'],
  note:'正式後端新增或更新紀錄時補上通用稽核欄位；時間與操作者須由伺服器產生。此檔列欄位，不宣稱已實作遷移或驗證器。',
  tables:Object.fromEntries(Object.entries(fields).map(([name,list]) => [name,{
    purpose:runtime.has(name)?'SYSTEM_GENERATED':'ADMIN_INPUT',
    fields:list.split(' '), blankRecord:Object.fromEntries(list.split(' ').map(k=>[k,null]))
  }]))
};
const table = (headers,rows) => `| ${headers.join(' | ')} |\n| ${headers.map(()=>'---').join(' | ')} |\n${rows.map(r=>`| ${r.join(' | ')} |`).join('\n')}\n`;
const dayName = date => weekdayNames[new Date(`${date}T00:00:00Z`).getUTCDay()];
const roster = `# Schedule_W1初版｜2026 年 11 月\n\n狀態：待填資料，尚未排班或公布。名稱沿用原需求，但本表包含完整月份。\n\n${table(['日期','星期','班別','時間','員工名單','需求人數','MaxStaff'],schedule.map(r=>{
  const s=shifts.find(s=>s.shiftId===r.shiftId);
  return [r.date,dayName(r.date),`${s.shiftId} ${s.shiftName}`,`${s.startTime}–${s.endTime}`,'','',''];
}))}\n同日多班只計一天出勤；每班同一員工不得重複列名。空白不代表休假、休診或零人需求。\n`;
const form = `# 排班資料填寫表｜2026 年 11 月\n\n這是無個資範本。請下載至私人位置或之後的受限 Google Sheets 填寫。不要將填妥的員工資料提交至 GitHub。\n\n## 1. 員工與限制\n\n以下代碼是預留位置，不是已確認在職員工。工時單位為小時，日數為整數；空白均待確認。\n\n${table(['員工代碼','姓名','啟用','月目標工時','最低月休','最多月出勤','最多連上','日工時上限','週工時上限','每日希望最低工時'],tables.Employees.map(e=>[e.employeeId,'','','','','','','','','']))}\n## 2. 班別時間及休息\n\n${table(['代碼','班別','開始','結束','不計薪休息分鐘','工時計算方式','生效日期'],shifts.map(s=>[s.shiftId,s.shiftName,s.startTime,s.endTime,'','','']))}\n班間空檔不能重複扣除；實際工作分鐘須在休息政策確認後計算。\n\n## 3. 每日各班需求與上限\n\n需求人數與上限獨立填寫，0 是已確認的零人，空白則未設定。週末不代表休診，國定假日與營業狀態另行確認。\n\n${table(['日期','星期','早班需求','早班MaxStaff','午班需求','午班MaxStaff','晚班需求','晚班MaxStaff','是否開診','是否國定假日'],dates.map(d=>[d,dayName(d),'','','','','','','','']))}\n## 4. 強制班別 ForcedShifts\n\n每列一位員工、一個日期、一個班別；同日 A、B、C 必須拆成三列。指定條件若與上限、不可排班或其他硬限制衝突，交由管理者處理。\n\n${table(['員工代碼','日期','班別代碼','來源','生效起日','生效迄日'],[])}\n## 5. 不可排班／希望休假\n\n待核准休假是軟偏好；已核准休假是硬限制。原因不放在此公開範本。\n\n${table(['員工代碼','日期','班別（空白為全天）','不可排班／希望休假','核准狀態'],[])}\n## 6. 固定週期、偏好、資格與搭班\n\n${table(['員工代碼','星期（1～7）','班別','固定上班／固定休假','必要／偏好','生效起日','生效迄日'],[])}\n${table(['員工代碼','早班偏好','午班偏好','晚班偏好','週末偏好','假日偏好','晚接早（禁止／避免／允許）'],[])}\n${table(['員工代碼','資格代碼','資格名稱','排班日期有效性查核來源','有效起日','有效迄日'],[])}\n${table(['日期','班別','資格代碼','最低合格人數','是否須不同人員擔任'],[])}\n${table(['員工甲','員工乙','必須同班／希望同班／禁止同班／希望不同班','生效起日','生效迄日'],[])}\n## 7. 既有班次與跨月資料\n\n提供足以驗證完整週工時、連上天數及休息間隔的前後月班表，不能固定假設只需一天。明確休假與資料缺漏必須區分。\n\n${table(['員工代碼','日期','班別','是否鎖定','班表版本'],[])}\n${table(['員工代碼','日期','已知上班／已確認休假／缺資料','來源班表版本'],[])}\n`;
for(const dir of ['templates','schemas','docs']) await mkdir(path.join(root,dir),{recursive:true});
await writeFile(path.join(root,'templates',`${month}.json`),JSON.stringify(data,null,2)+'\n');
await writeFile(path.join(root,'schemas','tables.json'),JSON.stringify(dictionary,null,2)+'\n');
await writeFile(path.join(root,'templates',`Schedule_W1初版_${month}.md`),roster);
await writeFile(path.join(root,'templates','資料填寫表.md'),form);
console.log('Generated 10 employee slots, 30 dates, 90 shifts, 30 table contracts. No real employee data.');
