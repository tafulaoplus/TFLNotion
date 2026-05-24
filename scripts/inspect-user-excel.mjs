// Read the user's example Excel files to understand the expected format
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const files = [
  resolve('Excel/ข้อมูลลูกค้า.xlsx'),
  resolve('Excel/รายรับ-รายจ่าย.xlsx'),
];

for (const f of files) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`FILE: ${f}`);
  console.log('='.repeat(72));
  try {
    const wb = XLSX.read(readFileSync(f));
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      console.log(`\n📋 Sheet: "${sheetName}"`);
      console.log(`   Range: ${ws['!ref']}`);
      if (ws['!merges']) console.log(`   Merges: ${JSON.stringify(ws['!merges']).slice(0,200)}`);
      // Print as table
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
      const maxRow = Math.min(rows.length, 50);
      for (let i = 0; i < maxRow; i++) {
        const row = rows[i] || [];
        const trimmed = row.slice(0, 12).map(c => {
          const s = String(c ?? '').slice(0, 28);
          return s.padEnd(28);
        }).join(' | ');
        console.log(`   ${String(i+1).padStart(3)}: ${trimmed}`);
      }
      if (rows.length > maxRow) console.log(`   ... (${rows.length - maxRow} more rows)`);

      // Show any formula cells
      const formulas = [];
      for (const addr in ws) {
        if (addr.startsWith('!')) continue;
        if (ws[addr].f) formulas.push(`   ${addr}: =${ws[addr].f}  (current value: ${ws[addr].v})`);
      }
      if (formulas.length) {
        console.log(`\n   📐 Formulas (${formulas.length}):`);
        formulas.slice(0, 20).forEach(f => console.log(f));
        if (formulas.length > 20) console.log(`   ... ${formulas.length - 20} more`);
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}
