// Usage: node scripts/merge-allowed-shifts.cjs latest-cloud.gs candidate.gs
// Always merge the latest exported cloud source, never rebuild an old Portal.gs.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('請指定最新雲端程式輸入與候選版輸出路徑');
const source=fs.readFileSync(input,'utf8');
if(source.includes('function getAllowedShiftSettings('))throw Error('來源已包含允許班別改版，請先核對版本，避免重複合併');
const lines=source.split(/\r?\n/),portal=lines.filter(l=>l.startsWith('const PORTAL_HTML_ = '));
if(portal.length!==1)throw Error('PORTAL_HTML_ 必須唯一');
let html=JSON.parse(portal[0].slice('const PORTAL_HTML_ = '.length).replace(/;\s*$/,''));
const marker='async function formLoad(name){';
if(html.split(marker).length!==2)throw Error('formLoad 必須唯一');
html=html.replace(marker,marker+"\n if(name==='AllowedShifts'||name==='允許班別組合')return asLoad();");
html=html.replace('</body>',fs.readFileSync(path.join(__dirname,'../gas/AllowedShifts.html'),'utf8')+'\n</body>');
const candidate=source.replace(portal[0],'const PORTAL_HTML_ = '+JSON.stringify(html)+';')+'\n'+fs.readFileSync(path.join(__dirname,'../gas/AllowedShifts.gs'),'utf8');
new vm.Script(candidate);
for(const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
fs.writeFileSync(output,candidate);
console.log('已保留最新雲端功能並合併允許班別設定；語法檢查通過。');
