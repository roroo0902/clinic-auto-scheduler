# 另一台電腦使用與開發交接
更新：2026-10-26

## 使用排班網站
開啟 https://roroo0902.github.io/clinic-auto-scheduler/ ，以已列在登入授權名單且有原始試算表權限的 Google 帳號登入。
填寫 → 預覽 → 確認寫入。資料存在共用的 Google Sheets；另一台電腦重新讀取即可看到已儲存內容。未送出的草稿不會跨電腦同步。
網站使用不需要啟動開發電腦，也不需要安裝 Git 或 ChatGPT。

## 在另一台電腦獨立開發
安裝 Git、Node.js 與 ChatGPT 桌面應用程式，登入所需帳號。首次取得程式：
```sh
git clone https://github.com/roroo0902/clinic-auto-scheduler.git
cd clinic-auto-scheduler
node --test tests/access.test.mjs tests/forms.test.mjs
```
在 ChatGPT 的 Codex 開啟該專案資料夾。每次開工前先檢查 git status，在工作目錄乾淨時執行 git pull --ff-only；有未提交修改時先整理，不要直接覆寫。工作完成後提交並推送。兩台電腦避免同時修改相同檔案。
GitHub 同步程式，不會同步整段本機對話、瀏覽器登入、Google 憑證或未提交檔案。另一台電腦需要自行登入 GitHub、Google 並完成必要授權，不要複製密碼或 token。

## 接續同一個本機對話
若兩台 ChatGPT 桌面應用程式均有遠端控制功能，可依官方說明在原電腦 Settings > Connections > Control this Mac or PC 設定，在另一台 Settings > Connections > Control other devices 加入原電腦。需相同 ChatGPT 帳號及工作區，並完成配對確認。功能依版本與推出範圍而異。
這是遠端使用原電腦；原電腦必須開機、連網並保持應用程式運作，非離線複製。
官方文件：https://learn.chatgpt.com/docs/remote-connections
目前尚未完成第二台電腦的配對，不應宣稱整段對話已同步。

## 專案現況與接手注意事項
- 網站：瑞恩幻想錄：輪值之誓。GitHub Pages 由 main 的 /docs 發布登入入口。
- 正式 Apps Script 部署為第 6 版，Google 登入、受保護名單、中文站內表單、預覽及確認寫入已上線。
- Google OAuth 使用 userinfo.email 與 spreadsheets；USER_ACCESSING 執行。每次後端請求檢查名單與角色，仍受 Google Sheets 權限限制。
- 已實測管理者備註寫入及讀回確認；17 項授權與表單測試通過。其他真人帳號尚未實測。
- 原始碼與部署細節見 gas/README.md。實際員工資料不得提交到公開 GitHub。
- gas/Access.gs：授權與選單；Model.gs：欄位驗證；Data.gs：讀寫及衝突檢查；Form.html：表單；Portal.gs：建置產物。
- 修改表單後執行 node scripts/build-login-portal.mjs，再測試。Apps Script 正式環境合併 Access.gs、Model.gs、Data.gs、Portal.gs，另有 appsscript.json。
- 推送 GitHub 不會自動更新 Apps Script。後端更新須儲存 GAS 程式並將既有部署更新到新版本，保留網站網址。
- 讀寫有快照衝突檢查、ScriptLock、讀回確認；外部直接編輯 Sheets 不受 ScriptLock 鎖定。
- 尚未啟用自動排班引擎或刪除功能。當月班表、參數索引與說明僅供查閱。
- 試算月份 2026-11；早 A 08:00–12:00、午 B 14:30–18:30、晚 C 18:30–21:30。同日多班僅算一天出勤。
- 排班規則仍須依正式規格確認；不要把目前的資料表單誤當成已完成的自動排班系統。

## 貼給另一台 ChatGPT 的交接文字
請接續維護 roroo0902/clinic-auto-scheduler。先讀 SECOND-COMPUTER.md 與 gas/README.md，確認 GitHub 最新版本及實際 GAS 部署，再開始修改。保留 Google 登入、受保護授權名單、站內表單預覽及確認寫入；真實資料只留在 Google Sheets。不要將程式已推送視為 GAS 已部署，也不要宣稱自動排班已完成。先告訴我目前讀到的版本與尚待處理項目。
