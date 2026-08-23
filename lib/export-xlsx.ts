/**
 * Prefix any string that starts with a character Excel/Sheets interprets as a
 * formula (=, +, -, @, tab, CR) so user-provided text can't execute formulas
 * when the downloaded file is opened in a spreadsheet app.
 */
function sanitizeCell(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  if (/^[=+\-@\t\r]/.test(value)) return `'${value}`;
  return value;
}

/**
 * Builds and triggers a browser download of an .xlsx workbook with one sheet.
 * The `xlsx` library is loaded dynamically so it is never bundled into the
 * page chunk at build time — it's only fetched when the user actually exports.
 *
 * @param rows    Array of plain objects — each object becomes a row.
 * @param headers Ordered column definitions: { header, key } pairs that
 *                determine the column order and display text.
 * @param filename Download filename (without extension).
 */
export async function downloadXlsx(
  rows: Record<string, unknown>[],
  headers: { header: string; key: string }[],
  filename: string,
): Promise<void> {
  const XLSX = await import('xlsx');

  const data = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const { key } of headers) {
      out[key] = sanitizeCell(row[key]);
    }
    return out;
  });

  const worksheet = XLSX.utils.json_to_sheet(data, {
    header: headers.map((h) => h.key),
  });

  // Rename columns from raw keys to human-readable headers
  const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (worksheet[addr]) {
      const idx = c - range.s.c;
      worksheet[addr].v = headers[idx].header;
    }
  }

  // Auto-size columns based on content width
  const colWidths: { wch: number }[] = [];
  for (const { header } of headers) {
    let maxLen = header.length;
    for (const row of data) {
      const val = row[headers[colWidths.length]?.key];
      const len = val == null ? 0 : String(val).length;
      if (len > maxLen) maxLen = len;
    }
    colWidths.push({ wch: Math.min(Math.max(maxLen + 2, 10), 50) });
  }
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  XLSX.writeFile(workbook, `${filename}.xlsx`);
}
