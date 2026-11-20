# 診所自動排班系統

> 使用員工名冊中的 Google 帳號登入：[排班入口](https://roroo0902.github.io/clinic-auto-scheduler/)。另一台電腦使用和接續開發方式見 [跨電腦交接指南](SECOND-COMPUTER.md)。

登入後可查閱個人月曆、整體班表與工時摘要；管理者可設定條件、檢查資料、產生整月預覽，覆核後才確認同步 Google 試算表。獨立驗收使用 17 位虛構人員，和正式班表分開。

網站：https://roroo0902.github.io/clinic-auto-scheduler/

工時摘要顯示月份標準與實排工時。標準工時來源不是診所開診狀態，也不代表個人實際排班。

## 開始填寫

- [資料填寫表](templates/資料填寫表.md)：員工、每日人力、強制班別、休假、資格與搭班。
- [Schedule_W1初版：11 月完整空表](templates/Schedule_W1初版_2026-11.md)：日期 × 班別 × 員工名單，共 90 列。
- [程式用 JSON 資料包](templates/2026-11.json)：可作為後續後端匯入格式。
- [欄位契約](schemas/tables.json)：26 個規格資料表及 4 個輔助輸入／歷史表。
- [填寫規則與使用說明](docs/data-guide.md)。

## 已確認的班別

| 代碼 | 班別 | 時間 |
| --- | --- | --- |
| A | 早班 | 08:00–12:00 |
| B | 午班 | 14:30–18:30 |
| C | 晚班 | 18:30–21:30 |

休息分鐘及實際計薪方式待確認，尚未將時段長度視為正式工時。空白／null 表示未知，不是零人、休假或休診。員工同日多班只算一天出勤。

## 現況

資料缺漏、無有效方案或未通過硬限制時不會發布；輸入與結果仍須人工覆核，不代表法規合規認證。操作見 [自動排班](docs/automatic-scheduling.md) 和 [GAS 說明](gas/README.md)。

GitHub 只放無個資範本，真實員工、請假與班表資料應在受限資料庫填寫。請在私人試算表填寫，不要直接在 GitHub 填入個資。

GitHub Pages 設定：公開儲存庫、main 分支、/docs 目錄。靜態入口由 GitHub Pages 發布。登入後的排班介面與後端由既有 Apps Script 部署提供，更新 GitHub 不會一併更新該部署。

檢查指令（不需第三方套件）：

```sh
node scripts/check-template.mjs
node --test
```
