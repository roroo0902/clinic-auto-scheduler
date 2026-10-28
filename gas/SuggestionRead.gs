// Shared read-only helper for checkouts predating the live v25 Access.gs.
// Omit this file when Access.gs already defines these exact helpers.
function readSheets_(read) {
  // Read-only callers. Never wrap batchUpdate or any operation that writes.
  // A bounded exponential backoff can span the per-minute quota refill.
  for (let attempt = 0; attempt < 7; attempt++) {
    try {
      return read();
    } catch (e) {
      const code = rosterReadFailure_(e).code;
      if (attempt === 6 || !['ACCESS_READ_LIMIT','ACCESS_READ_TEMPORARY'].includes(code)) throw e;
      console.warn('SHEETS_READ_RETRY ' + code);
      Utilities.sleep(Math.min(32000,1000 * Math.pow(2,attempt)) + Math.floor(Math.random()*1000));
    }
  }
}

function rosterReadFailure_(error) {
  const message = String(error && error.message || '').toLowerCase();
  // These labels describe returned service errors, not a diagnosis of past failures.
  // No authorization cache: exhausted read retries always deny this request.
  if (/quota|rate.?limit|too many requests|resource.?exhausted|invoked too many times|\b429\b/.test(message)) {
    return {code:'ACCESS_READ_LIMIT', message:'Google 試算表讀取次數已達限制，請稍後重新讀取班表，再決定是否送出變更。'};
  }
  if (/temporar|unavailable|internal error|backend.?error|timed? out|timeout|\b(500|502|503|504)\b/.test(message)) {
    return {code:'ACCESS_READ_TEMPORARY', message:'Google 試算表暫時無法讀取，請稍後重新讀取班表，再決定是否送出變更。'};
  }
  if (/permission denied|permission_denied|does not have permission|access denied|insufficient.*permission/.test(message)) {
    return {code:'ACCESS_READ_PERMISSION', message:'Google 試算表拒絕讀取，請確認登入帳號的試算表存取權限。'};
  }
  return {code:'ACCESS_READ_UNKNOWN', message:'無法讀取授權名單，原因尚未確認。請重新讀取班表；若持續失敗，請管理者查看執行記錄。'};
}

