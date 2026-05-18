import * as XLSX from 'xlsx';

/** Parsed row from the product catalog .xls (Vietnamese column headers). */
export interface ProductImportRow {
  rowNumber: number;
  item_code: string;
  item_name: string;
  cost_price: number;
  selling_price: number;
  weight_gram: number;
}

export interface ProductImportParseResult {
  rows: ProductImportRow[];
  skipped: number;
  errors: string[];
}

const HEADER_ITEM_CODE = 'Mã sản phẩm';
const HEADER_ITEM_NAME = 'Tên sản phẩm gốc';
const HEADER_COST_PRICE = 'Giá nhập';
const HEADER_SELLING_PRICE = 'Đơn giá';
const HEADER_WEIGHT_GRAM = 'Khối lượng (gram)';

const REQUIRED_HEADERS = [
  HEADER_ITEM_CODE,
  HEADER_ITEM_NAME,
  HEADER_COST_PRICE,
  HEADER_SELLING_PRICE,
  HEADER_WEIGHT_GRAM,
] as const;

function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Normalize locale-formatted numbers (VN dot thousands, Excel comma thousands). */
function normalizeLocalizedNumber(raw: string): string {
  const hasDot = raw.includes('.');
  const hasComma = raw.includes(',');

  if (hasDot && hasComma) {
    return raw.lastIndexOf(',') > raw.lastIndexOf('.')
      ? raw.replace(/\./g, '').replace(',', '.')
      : raw.replace(/,/g, '');
  }
  if (hasComma && /^\d{1,3}(,\d{3})+$/.test(raw)) {
    return raw.replace(/,/g, '');
  }
  if (hasDot && /^\d{1,3}(\.\d{3})+$/.test(raw)) {
    return raw.replace(/\./g, '');
  }
  if (hasComma) {
    return raw.replace(',', '.');
  }
  return raw;
}

/**
 * Vietnamese spreadsheet numbers use "." as thousands separator (e.g. 750.000 → 750000)
 * and "," as decimal separator (e.g. 12,5 → 12.5). Excel may also emit comma thousands.
 */
export function parseVietnameseNumber(value: unknown): number {
  if (value == null || value === '') {
    return 0;
  }
  const raw =
    typeof value === 'number' && Number.isFinite(value)
      ? String(value)
      : String(value).trim();
  if (!raw) {
    return 0;
  }
  const normalized = normalizeLocalizedNumber(raw);
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** Prefer Excel formatted text (`w`) so values like 750.000 are not read as 750. */
function getCellDisplayValue(
  sheet: XLSX.WorkSheet,
  row: number,
  col: number,
): unknown {
  const ref = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[ref];
  if (!cell) {
    return undefined;
  }
  const formatted = cell.w != null ? String(cell.w).trim() : '';
  if (formatted !== '') {
    return formatted;
  }
  return cell.v;
}

function findHeaderRowIndex(matrix: unknown[][]): number {
  const maxScan = Math.min(matrix.length, 20);
  for (let i = 0; i < maxScan; i++) {
    const row = matrix[i] ?? [];
    const cells = row.map(normalizeHeader);
    if (cells.includes(HEADER_ITEM_CODE) && cells.includes(HEADER_ITEM_NAME)) {
      return i;
    }
  }
  return -1;
}

function buildColumnIndex(headers: string[]): Record<string, number> {
  const index: Record<string, number> = {};
  for (let i = 0; i < headers.length; i++) {
    const key = normalizeHeader(headers[i]);
    if (key) {
      index[key] = i;
    }
  }
  return index;
}

function cellAt(row: unknown[], colIndex: Record<string, number>, header: string): unknown {
  const idx = colIndex[header];
  if (idx == null) {
    return undefined;
  }
  return row[idx];
}

/**
 * Reads the first worksheet of a legacy .xls / .xlsx buffer and returns product rows.
 * Skips blank lines; rows without `Tên sản phẩm gốc` are counted in `skipped`.
 */
export function parseProductRowsFromXls(buffer: Buffer): ProductImportParseResult {
  const errors: string[] = [];
  const rows: ProductImportRow[] = [];
  let skipped = 0;

  if (!buffer?.length) {
    return { rows, skipped, errors: ['File is empty'] };
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  } catch {
    return { rows, skipped, errors: ['Could not read Excel file'] };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows, skipped, errors: ['Workbook has no sheets'] };
  }

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  const headerRowIndex = findHeaderRowIndex(matrix);
  if (headerRowIndex < 0) {
    return {
      rows,
      skipped,
      errors: [
        `Header row not found (expected columns such as "${HEADER_ITEM_CODE}")`,
      ],
    };
  }

  const headerCells = (matrix[headerRowIndex] ?? []).map(normalizeHeader);
  const colIndex = buildColumnIndex(headerCells);

  const missing = REQUIRED_HEADERS.filter((h) => colIndex[h] == null);
  if (missing.length > 0) {
    return {
      rows,
      skipped,
      errors: [`Missing required columns: ${missing.join(', ')}`],
    };
  }

  for (let r = headerRowIndex + 1; r < matrix.length; r++) {
    const row = matrix[r] ?? [];
    const rowNumber = r + 1;
    const itemCode = String(cellAt(row, colIndex, HEADER_ITEM_CODE) ?? '').trim();
    const itemName = String(cellAt(row, colIndex, HEADER_ITEM_NAME) ?? '').trim();

    if (!itemCode && !itemName) {
      skipped++;
      continue;
    }
    if (!itemCode) {
      skipped++;
      errors.push(`Row ${rowNumber}: missing "${HEADER_ITEM_CODE}"`);
      continue;
    }

    const costCol = colIndex[HEADER_COST_PRICE];
    const sellCol = colIndex[HEADER_SELLING_PRICE];
    const weightCol = colIndex[HEADER_WEIGHT_GRAM];

    rows.push({
      rowNumber,
      item_code: itemCode,
      item_name: itemName || itemCode,
      cost_price: parseVietnameseNumber(
        getCellDisplayValue(sheet, r, costCol),
      ),
      selling_price: parseVietnameseNumber(
        getCellDisplayValue(sheet, r, sellCol),
      ),
      weight_gram: Math.round(
        parseVietnameseNumber(getCellDisplayValue(sheet, r, weightCol)),
      ),
    });
  }

  return { rows, skipped, errors };
}

export interface ProductImportResult {
  productsCreated: number;
  productsUpdated: number;
  adaptionsCreated: number;
  adaptionsUpdated: number;
  skipped: number;
  errors: string[];
}
