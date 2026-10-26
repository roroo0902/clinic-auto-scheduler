# Google 登入入口（待部署驗證）

此後端使用 Apps Script 的 Google 登入，必須部署為「以存取網頁應用程式的使用者執行」，限定 Google 帳號。每個請求以該使用者的 Google 權限讀取「登入授權名單」，不接收密碼、不接收前端提供的信箱、不回傳 OAuth token。

部署 Access.gs、Portal.gs、appsscript.json（網頁編輯器也可將前兩者合併為一個 .gs）。使用唯讀試算表及電子郵件 scope。新增版本後設定為 USER_ACCESSING、ANYONE（Google 帳號；不是 ANYONE_ANONYMOUS）。先驗證擁有者可進入、未列名帳號被拒、停用後下一次請求被拒，再將 GitHub Pages 首頁改成登入入口。未驗證部署前不得宣稱登入已啟用。

正式專案：https://script.google.com/home/projects/1YBSX8SnfzVMyoetC5gwYDTzD81HW4dxbjtc21peNB-rM_VgLOgmdZRXP/edit

授權名單欄位：Google 信箱、顯示名稱、角色、啟用、備註。啟用必須是真正勾選的布林值；重複信箱拒絕登入。僅允許「管理者」「一般使用者」。分頁只允許既有擁有者修改。

此版本是受保護的試算表入口，不是排班引擎或表單寫入 API。一般使用者的實際讀寫權由 Google Sheets 分享與保護設定決定；角色僅控制網站管理連結。Google Sheets 已有權限的人仍能直接開啟原始檔。停用網站帳號不會撤銷 Google Drive 權限，完全離職停權時需另行移除原始檔分享。

公開 GitHub Pages 與公開原始碼不能作為機密資料儲存處。不要把名單、密碼或 token 加入前端。所有後續後端讀寫方法均須先呼叫 requireMember_()，並依動作檢查角色。

建置：node scripts/build-login-portal.mjs

測試：node --test tests/access.test.mjs

官方依據：https://developers.google.com/apps-script/guides/web
