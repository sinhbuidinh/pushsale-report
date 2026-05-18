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

/** Vietnamese spreadsheet numbers often use "." as thousands separator (e.g. 750.000). */
export function parseVietnameseNumber(value: unknown): number {
  if (value == null || value === '') {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const raw = String(value).trim();
  if (!raw) {
    return 0;
  }
  const normalized = raw.replace(/\./g, '').replace(/,/g, '.');
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
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
    workbook = XLSX.read(buffer, { type: 'buffer' });
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

    rows.push({
      rowNumber,
      item_code: itemCode,
      item_name: itemName || itemCode,
      cost_price: parseVietnameseNumber(
        cellAt(row, colIndex, HEADER_COST_PRICE),
      ),
      selling_price: parseVietnameseNumber(
        cellAt(row, colIndex, HEADER_SELLING_PRICE),
      ),
      weight_gram: Math.round(
        parseVietnameseNumber(cellAt(row, colIndex, HEADER_WEIGHT_GRAM)),
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
