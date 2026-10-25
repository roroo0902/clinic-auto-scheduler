# 排班資料使用說明

本次交付是資料範本與欄位契約，不是已完成的排班引擎、GAS 後端、Google Sheets 資料庫或網站。規格基準為使用者提供的 2026-10-25 文件，正式規則為 1～46；規則 47 保持待決。

## 建議填寫順序

1. 下載 `templates/資料填寫表.md`，填入員工代碼對應的姓名、是否啟用與個別限制。EMP001～EMP010 只是預留代碼，不代表已有這些員工。
2. 確認三班時間的生效期間與休息計算；時間沿用已提供的早 08:00–12:00、午 14:30–18:30、晚 18:30–21:30。A/B/C 為先前格式沿用的代碼，可在正式導入前映射。
3. 填入 30 天各班 `requiredHeadcount`（需求）與 `MaxStaff`（硬上限）。需求不能超過上限；有矛盾必須人工處理。不得把上限當成必須排滿的人數。
4. 填入強制班別、休假、固定週期、偏好、搭班及職務資格需求。
5. 補上既有班次、鎖定與跨月資料，確認工時制度、週次起算及適用法規。缺資料不假定休假。
6. 後續在受限資料庫匯入及完成全部必要驗證，才可產生並核准正式班表。

## 程式讀取約定

- `templates/2026-11.json` 是單一資料包，`tables` 使用 Google Sheets 邏輯分頁名稱。`schemas/tables.json` 列出欄位與空紀錄範本，尚不是正式 JSON Schema 驗證規格或遷移程式。
- JSON `null` 代表未知／待填，`0` 代表已確認零值，`false` 代表已確認否；不可互換。數字不得填文字「待提供」。
- 無資料的陣列不代表該項規則已確認不適用。正式使用前仍需管理者確認資料完整性。
- 日期為 `YYYY-MM-DD`、時間為 `HH:mm`，排班解讀時區為 Asia/Taipei；星期為 1（週一）至 7（週日）。週末、國定假日、法定休息日及休診日分開。
- `ForcedShifts` 每列只有一個 employeeId/date/shiftId；一天三班需三列。強制條件不得凌駕法規、不可排班、鎖定及各項硬限制。遇衝突回報而非強排。
- `ScheduleAssignments` 是未來系統的正式明細，每列一位員工的一班；`scheduleView` 只是尚未填寫的日期 × 班別空表，不可當成正式版本。
- 出勤按員工的不同上班日期計算。相同員工、日期、班別不能重複；多班的實際工作分鐘需依確認後的休息政策累計。
- `CrossMonthCoverage.coverageStatus` 使用 WORK / REST / UNKNOWN，REST 必須有可信來源；實際跨月班次使用 ScheduleAssignments 與版本來源記錄。需要涵蓋多少前後日期，取決於完整週次、連上與跨日休息條件。
- `EmployeeAvailability.conditionType` 使用 UNAVAILABLE / PREFER_OFF；核准請假是硬限制。`RecurringAvailability.conditionType` 使用 WORK / OFF，`isHard` 區分必要或偏好。
- `PairingRules.pairingMode` 使用 REQUIRED_TOGETHER / PREFERRED_TOGETHER / FORBIDDEN_TOGETHER / PREFERRED_APART；「同班」須同日期、同班別。
- `ShiftTransitions.ruleMode` 使用 FORBID / AVOID / ALLOW。ALLOW 不免除法定休息要求。
- 技能與法定職務的有效性依排班日期查核，最低資格人數與總人數缺額分開；需要不同人的資格名額不能由同一人重複占用。
- 目標工時、偏好排序與歷史設定未提供，保持 null／空表，不自行指定公平權重或提早停止門檻。
- 表格 01～26 對應主規格；另加 ForcedShifts、CrossMonthCoverage、EmployeeSettingsHistory、LegalPolicy 四份欄位契約以承接已確認功能，未新增業務規則。

## GitHub 與私人資料

本儲存庫只提交無個資範本、程式與說明。真實姓名、請假原因、完整班表、管理員名單、憑證及備份存在受限 Google Sheets／Drive／後端設定。管理員帳號與已建立備份資料夾已在對話中確認，但不寫入可公開的範本。

本機填妥的資料請放 `private-data/`；此路徑已加入 `.gitignore`。忽略規則不是授權機制，也不能移除已提交的歷史。不要將 filled-in 資料移回 templates/。

## 檢查與限制

使用已安裝的 Node.js 執行：

```sh
node scripts/check-template.mjs
node --test
```

這些檢查只驗證空白範本的欄位、日期、數量及未知值處理，不等於規則 1～46、T01～T23、法規查核或部署驗收通過。系統操作紀錄表保持空白，不虛構 Commit、GAS 版本、核准或備份成功紀錄。

`node scripts/build-template.mjs` 會重新產生範本檔案；請勿在其中填寫真實資料後再執行，以免覆蓋已填內容。正式遷移、權限驗證及排班仍待開發。
