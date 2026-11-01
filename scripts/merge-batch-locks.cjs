const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function merge(source){
 if(source.includes('function saveScheduleDayLocks('))throw Error('已包含批次鎖定，請先核對最新版');
 if(!source.includes('function saveScheduleDayLock('))throw Error('缺少當日鎖定前置功能');
 const lines=source.split(/\r?\n/).filter(x=>x.startsWith('const PORTAL_HTML_ = '));if(lines.length!==1)throw Error('找不到唯一網站內容');
 let html=JSON.parse(lines[0].slice('const PORTAL_HTML_ = '.length).replace(/;\s*$/,''));
 if(html.split('</body>').length!==2)throw Error('網站結構不符');
 html=html.replace('</body>',fs.readFileSync(path.join(__dirname,'../gas/ScheduleBatchLocks.html'),'utf8')+'\n</body>');
 source=source.replace(lines[0],'const PORTAL_HTML_ = '+JSON.stringify(html)+';')+'\n'+fs.readFileSync(path.join(__dirname,'../gas/ScheduleBatchLocks.gs'),'utf8');
 new vm.Script(source);for(const m of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);return source;
}
module.exports={merge};if(require.main===module){const [input,output]=process.argv.slice(2);fs.writeFileSync(output,merge(fs.readFileSync(input,'utf8')));console.log('批次鎖定合併及語法檢查通過');}
