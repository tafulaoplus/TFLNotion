import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';

const wb = XLSX.read(readFileSync('Excel/02.xlsx'));
console.log('Sheets:', wb.SheetNames);
for(const sn of wb.SheetNames){
  const ws = wb.Sheets[sn];
  console.log(`\n=== Sheet "${sn}" Range: ${ws['!ref']} ===`);
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false });
  for(let i=0;i<Math.min(30,rows.length);i++){
    if(!rows[i].some(c=>c!=='')) continue;
    console.log(`${String(i+1).padStart(3)}: ${rows[i].slice(0,12).map(c=>String(c).padEnd(22)).join('|')}`);
  }
  const fs = Object.entries(ws).filter(([k,v])=>!k.startsWith('!') && v.f).slice(0,30);
  if(fs.length){ console.log(`\nFormulas:`); fs.forEach(([k,v])=>console.log(`  ${k}=${v.f}`)); }
}
