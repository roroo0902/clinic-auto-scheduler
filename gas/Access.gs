// Deploy as USER_ACCESSING. Do not deploy as the owner.
const ACCESS_SHEET_ID = '1yXezGllA3WtarKxIpWrVJmObqizbhnBAjub8cFMATiQ';
const ACCESS_TAB = '登入授權名單';

function matchMember_(rows, email) {
  const expected = ['Google 信箱', '顯示名稱', '角色', '啟用', '備註'];
  if (!email || !rows.length || expected.some((v, i) => rows[0][i] !== v)) throw Error('登入設定無法驗證，請聯絡管理者。');
  const key = String(email).trim().toLowerCase();
  const found = rows.slice(1).filter(r => String(r[0]).trim().toLowerCase() === key);
  if (found.length !== 1 || found[0][3] !== true || !['管理者', '一般使用者'].includes(found[0][2])) throw Error('此帳號未獲授權或已停用，請聯絡管理者。');
  return {email: key, name: String(found[0][1]), role: found[0][2]};
}

function requireMember_() {
  const email = Session.getActiveUser().getEmail();
  const effective = Session.getEffectiveUser().getEmail();
  // Fail closed if identity is unavailable or deployment is acting as another person.
  if (!email || email.toLowerCase() !== effective.toLowerCase()) throw Error('無法驗證登入者，請以自己的 Google 帳號登入。');
  let rows;
  try {
    const result = Sheets.Spreadsheets.Values.get(ACCESS_SHEET_ID, "'" + ACCESS_TAB + "'!A1:E1001", {valueRenderOption: 'UNFORMATTED_VALUE'});
    rows = result.values || [];
    if (rows.length > 1000) throw Error('Invalid roster');
  } catch (e) {
    throw Error('無法讀取授權名單，請確認此 Google 帳號具有排班試算表的存取權限。');
  }
  return matchMember_(rows, email);
}

function getCurrentMember() { return requireMember_(); }

function getMenuSection(section) {
  const member = requireMember_(); // Re-read on every request, so revocation takes effect.
  const menus = {
    new: {title:'召喚醫者', tabs:['Employees','EmployeeQualifications','AllowedShifts']},
    roles: {title:'英靈編成', tabs:['Employees','AllowedShifts','EmployeeAvailability','RecurringAvailability','ForcedShifts','EmployeePreferences','組合優先設定','班別優先人員','LeaveRequests','個人假日設定']},
    battle: {title:'啟動命運之輪', tabs:['排班控制','DailyShiftDemands','Schedule_W1初版','統計與檢查規則']},
    other: {title:'禁忌藏書閣', tabs:['參數設定索引','使用說明','ShiftDefinitions','CalendarDates']}
  };
  if (!Object.prototype.hasOwnProperty.call(menus, section)) throw Error('無效的選單。');
  if (section === 'other' && member.role === '管理者') menus.other.tabs.push(ACCESS_TAB, 'SystemConfig');
  return {title:menus[section].title, links:menus[section].tabs.map(name => ({name, label:FORM_NAMES_[name]||name, url:'https://docs.google.com/spreadsheets/d/'+ACCESS_SHEET_ID+'/edit#range='+encodeURIComponent("'"+name.replace(/'/g,"''")+"'!A1")}))};
}

function doGet() {
  try {
    requireMember_();
    return HtmlService.createHtmlOutput(PORTAL_HTML_).setTitle('瑞恩幻想錄：輪值之誓').addMetaTag('viewport','width=device-width, initial-scale=1, viewport-fit=cover');
  } catch (e) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><style>body{font:18px/1.8 system-ui;max-width:600px;margin:60px auto;padding:24px}h1{font-size:28px}</style><h1>尚無法進入瑞恩幻想錄</h1><p>'+escapeHtml_(e.message)+'</p><p>請確認登入帳號，或請管理者檢查「登入授權名單」。</p></html>').setTitle('登入權限確認').addMetaTag('viewport','width=device-width, initial-scale=1');
  }
}

function escapeHtml_(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

