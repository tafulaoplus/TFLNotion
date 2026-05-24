// Show the P&L file specifically
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const wb = XLSX.read(readFileSync(resolve('Excel/รายรับ-รายจ่าย.xlsx')));
for (const sn of wb.SheetNames) {
  const ws = wb.Sheets[sn];
  console.log(`Sheet: ${sn}  Range: ${ws['!ref']}`);
  const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:'', raw:false });
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    if (!rows[i].some(c => c !== '')) continue;
    const cells = rows[i].slice(0,10).map(c => String(c).padEnd(20));
    console.log(`${String(i+1).padStart(4)}: ${cells.join(' | ')}`);
  }
  // formulas
  const fs = Object.entries(ws).filter(([k,v]) => !k.startsWith('!') && v.f).slice(0,30);
  if (fs.length) {
    console.log(`\nFormulas:`);
    fs.forEach(([k,v]) => console.log(`  ${k} = ${v.f}  → ${v.v}`));
  }
}
