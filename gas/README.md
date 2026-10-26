# Google 登入與網站內表單（已部署）

2026-10-26 中文化更新：原正式網址已更新至第 8 版；32 個分頁名稱及 341 個英文欄位標題改為繁體中文。原已是中文的名稱保留，共核對 40 個分頁與 368 個標題。Data.gs 依分頁對照還原程式內部欄位鍵，因此原本的人數檢查、資料型別、角色限制、衝突檢查及預覽寫入流程沿用。38 項本機測試通過，包含中文欄位回歸測試。此項變更僅改名稱與標題，不初始化正式資料。

管理者可在 Apps Script 編輯器執行 verifyChineseCompatibility，唯讀檢查全部網站資料項目，執行記錄僅輸出檢查數量。第 8 版已包含相容處理；診斷工具是後續加入的編輯器輔助函式。多個 Google 帳號同時登入的瀏覽器曾出現 Apps Script 導向「找不到網頁」，網站完整點選流程需以能正常開啟正式網址的工作階段驗證。

2026-10-26 雲端實測：以管理者身分在 Apps Script 執行上述診斷，21 個網站資料項目全部讀取通過，未修改資料。

2026-10-26 已部署第 6 版。使用者已明確同意由唯讀升級為試算表讀寫。已在正式網站以管理者備註的啟用紀錄驗證寫入與讀回；沒有更動員工或排班資料。17 項模擬測試通過，涵蓋授權、資料驗證、衝突防護及 API 欄位順序變化。

## 操作與授權

網站中文選單 → 站內表單 → 預覽變更 → 勾選確認 → 寫入 Google Sheets。設定資料可新增與修改；當月班表、參數索引與使用說明僅供查閱。此版本尚未啟用自動排班，不提供刪除資料。

Apps Script 以 USER_ACCESSING 執行，ANYONE 表示已登入 Google 帳號，並非匿名開放。每次讀寫均重新驗證受保護的「登入授權名單」，再檢查角色；Google Sheets 自身分享及保護權限仍適用。新增登入名單不會授予 Google Drive 權限，停用名單也不會移除原始檔分享。

使用 userinfo.email 與 spreadsheets OAuth scopes。後者涵蓋使用者可存取的試算表，程式固定只處理 ACCESS_SHEET_ID 指定的排班檔案。其他使用者首次使用可能須完成 Google 授權；其他真人帳號的授權流程尚未實測。

授權名單欄位為 Google 信箱、顯示名稱、角色、啟用、備註。角色僅允許管理者／一般使用者，啟用須為布林值，重複信箱拒絕登入。名單分頁保護僅允許擁有者修改。公開 GitHub 不得儲存名單、密碼或 token。

## 部署

合併 Access.gs、Model.gs、Data.gs、Portal.gs 到 Apps Script，並使用 appsscript.json。網頁表單透過 google.script.run 呼叫後端，不需要另外設定 OAuth Client ID。

建置：node scripts/build-login-portal.mjs
測試：node --test tests/access.test.mjs tests/forms.test.mjs

登入網址：https://script.google.com/macros/s/AKfycbyuwmhkBqs1A6kk5IkPx0cdso_2eBdrxjyNHzD22ho9cI06mYZMDDbxvyP7iDsMaOmT/exec

正式專案：https://script.google.com/home/projects/1YBSX8SnfzVMyoetC5gwYDTzD81HW4dxbjtc21peNB-rM_VgLOgmdZRXP/edit

## 資料一致性

儲存以 ScriptLock 串行處理本站請求，比對排序後的資料快照並讀回確認。Google API 物件屬性順序改變不會誤報資料衝突；實際內容變更仍拒絕舊草稿。Google Sheets 外部直接編輯不受 ScriptLock 保護，請避免同時編輯同一列。公式欄保留，未支援的進階資料驗證拒絕修改。
