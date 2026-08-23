import * as XLSX from 'xlsx';

export interface ParsedImportRow {
  name: string;
  email: string;
  phone: string | null;
  hours: number;
  reflection: string | null;
  volunteered_date: string;
  category_name: string | null;
  sub_category_name: string | null;
  volunteer_state: string | null;
}

export interface ParseResult {
  rows: ParsedImportRow[];
  errors: string[];
}

// Normalize various header spellings to canonical keys.
const HEADER_ALIASES: Record<string, string> = {
  'volunteer name': 'name',
  'name': 'name',
  'first name': 'first_name',
  'last name': 'last_name',
  'phone number': 'phone',
  'phone': 'phone',
  'email': 'email',
  'hours': 'hours',
  'reflection': 'reflection',
  'volunteered date': 'volunteered_date',
  'volunteer date': 'volunteered_date',
  'submission date': 'submission_date',
  'approved date': 'approved_date',
  'joined date': 'joined_date',
  'last accessed': 'last_accessed',
  'volunteer state': 'volunteer_state',
  'state': 'volunteer_state',
  'sub-category': 'sub_category_name',
  'subcategory': 'sub_category_name',
  'category': 'category_name',
};

function normalizeHeader(raw: string): string {
  const cleaned = raw.trim().toLowerCase().replace(/\s+/g, ' ');
  return HEADER_ALIASES[cleaned] || cleaned;
}

function parseDateCellValue(cell: unknown): string | null {
  if (!cell) return null;
  // XLSX can return dates as serial numbers or Date objects
  if (cell instanceof Date) {
    return cell.toISOString().split('T')[0];
  }
  if (typeof cell === 'number') {
    // Excel serial date number — use XLSX.SSF.format to convert
    const formatted = XLSX.SSF.format('yyyy-mm-dd', cell);
    if (formatted && formatted !== 'NaN' && !formatted.includes('#')) {
      return formatted;
    }
    // Fallback manual conversion (Excel epoch: 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const ms = epoch.getTime() + Math.round(cell * 86400000);
    return new Date(ms).toISOString().split('T')[0];
  }
  if (typeof cell === 'string') {
    // Try to parse ISO or common formats
    const trimmed = cell.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.split('T')[0];
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  }
  return null;
}

export async function parseImportFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], errors: ['Spreadsheet has no sheets.'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: true,
    defval: null,
  });

  if (rawRows.length === 0) {
    return { rows: [], errors: ['Spreadsheet has no data rows.'] };
  }

  // Build normalized header map from the first row's keys
  const sampleKeys = Object.keys(rawRows[0]);
  const headerMap: Record<string, string> = {};
  for (const key of sampleKeys) {
    const normalized = normalizeHeader(key);
    headerMap[key] = normalized;
  }

  const errors: string[] = [];

  // Check required columns exist
  const normalizedKeys = new Set(Object.values(headerMap));
  if (!normalizedKeys.has('name') && !(normalizedKeys.has('first_name') && normalizedKeys.has('last_name'))) {
    errors.push('Missing "Volunteer Name" or "First Name" + "Last Name" column.');
  }
  if (!normalizedKeys.has('email')) {
    errors.push('Missing "Email" column.');
  }
  if (!normalizedKeys.has('hours')) {
    errors.push('Missing "Hours" column.');
  }
  if (!normalizedKeys.has('volunteered_date')) {
    errors.push('Missing "Volunteered Date" column.');
  }

  if (errors.length > 0) {
    return { rows: [], errors };
  }

  const rows: ParsedImportRow[] = [];

  for (let i = 0; i < rawRows.length; i++) {
    const raw = rawRows[i];

    // Build a normalized object from the row
    const norm: Record<string, unknown> = {};
    for (const [originalKey, normalizedKey] of Object.entries(headerMap)) {
      norm[normalizedKey] = raw[originalKey];
    }

    // Resolve name: prefer "Volunteer Name", fall back to "First Name" + "Last Name"
    let name = String(norm['name'] || '').trim();
    if (!name) {
      const first = String(norm['first_name'] || '').trim();
      const last = String(norm['last_name'] || '').trim();
      name = `${first} ${last}`.trim();
    }

    const email = String(norm['email'] || '').trim().toLowerCase();
    const hoursRaw = norm['hours'];
    const hours = typeof hoursRaw === 'number' ? hoursRaw : parseFloat(String(hoursRaw || '0'));
    const dateStr = parseDateCellValue(norm['volunteered_date']);

    const phone = norm['phone'] ? String(norm['phone']).trim() : null;
    const reflection = norm['reflection'] ? String(norm['reflection']).trim() : null;
    const categoryName = norm['category_name'] ? String(norm['category_name']).trim() : null;
    const subCategoryName = norm['sub_category_name'] ? String(norm['sub_category_name']).trim() : null;
    const volunteerState = norm['volunteer_state'] ? String(norm['volunteer_state']).trim() : null;

    if (!name || !email) {
      errors.push(`Row ${i + 2}: missing name or email, skipped.`);
      continue;
    }
    if (isNaN(hours) || hours < 0.25 || hours > 24) {
      errors.push(`Row ${i + 2}: invalid hours (${hoursRaw}), skipped.`);
      continue;
    }
    if (!dateStr) {
      errors.push(`Row ${i + 2}: could not parse volunteered date, skipped.`);
      continue;
    }

    rows.push({
      name,
      email,
      phone,
      hours,
      reflection,
      volunteered_date: dateStr,
      category_name: categoryName,
      sub_category_name: subCategoryName,
      volunteer_state: volunteerState,
    });
  }

  return { rows, errors };
}
