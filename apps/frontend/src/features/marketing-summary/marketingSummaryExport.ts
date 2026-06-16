import ExcelJS from 'exceljs';

type MetricFormat = 'number' | 'percent' | 'ratio';

export interface ExportMetricDef {
  key: string;
  label: string;
  format: MetricFormat;
  emphasize?: boolean;
}

export interface ExportOverviewRow {
  cells: (string | number | null)[];
}

export type ExportColumnVariant = 'default' | 'unmatched' | 'total';

export interface ExportMetricColumn {
  header: string;
  subheader?: string;
  quantityLabel?: string;
  variant?: ExportColumnVariant;
  getValue: (metricKey: string) => string | number | null;
}

export interface MarketingSummaryExportInput {
  fileNameBase: string;
  overviewHeaders: string[];
  overviewRows: ExportOverviewRow[];
  metricDefs: ExportMetricDef[];
  metricColumns: ExportMetricColumn[];
}

const ORANGE_ROW_METRICS = new Set(['ads_spend', 'revenue_estimate']);
const GREEN_ROW_METRICS = new Set(['poas']);

const COLORS = {
  headerBg: 'FFF5F5F5',
  orangeRowBg: 'FFFFF3E0',
  greenRowBg: 'FFE8F5E9',
  totalColBg: 'FFECEFF1',
  unmatchedColBg: 'FFFFF8E1',
  profitGood: 'FF1B5E20',
  profitGoodBg: 'FFE8F5E9',
  profitBad: 'FFB71C1C',
  profitBadBg: 'FFFFEBEE',
  unmatchedHighlight: 'FFD32F2F',
  unmatchedHighlightBg: 'FFFFEBEE',
  thinBorder: { style: 'thin' as const, color: { argb: 'FFE0E0E0' } },
};

const NUM_FMT = {
  integer: '#,##0',
  percent: '0.00"%"',
  ratio: '#,##0.00',
};

const sanitizeFileName = (name: string): string =>
  name.replace(/[/\\?%*:|"<>]/g, '-').replace(/\s+/g, '_');

const metricRowBg = (metricKey: string): string | undefined => {
  if (ORANGE_ROW_METRICS.has(metricKey)) return COLORS.orangeRowBg;
  if (GREEN_ROW_METRICS.has(metricKey)) return COLORS.greenRowBg;
  return undefined;
};

const numFmtFor = (format: MetricFormat): string | undefined => {
  if (format === 'percent') return NUM_FMT.percent;
  if (format === 'ratio') return NUM_FMT.ratio;
  return NUM_FMT.integer;
};

const applyBorder = (cell: ExcelJS.Cell): void => {
  cell.border = {
    top: COLORS.thinBorder,
    left: COLORS.thinBorder,
    bottom: COLORS.thinBorder,
    right: COLORS.thinBorder,
  };
};

const styleHeaderCell = (
  cell: ExcelJS.Cell,
  opts?: { align?: 'left' | 'right' | 'center'; bg?: string },
): void => {
  cell.font = { bold: true, size: 11 };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: opts?.bg ?? COLORS.headerBg },
  };
  cell.alignment = {
    vertical: 'middle',
    horizontal: opts?.align ?? 'left',
    wrapText: true,
  };
  applyBorder(cell);
};

const styleMetricLabelCell = (
  cell: ExcelJS.Cell,
  metric: ExportMetricDef,
): void => {
  const rowBg = metricRowBg(metric.key);
  cell.font = { bold: metric.emphasize ?? false, size: 11 };
  if (rowBg) {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: rowBg },
    };
  }
  cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  applyBorder(cell);
};

const profitCellStyle = (
  metricKey: string,
  value: number | null,
): Partial<ExcelJS.Style> | undefined => {
  if (value == null) return undefined;
  if (metricKey === 'profit_after_ads' || metricKey === 'ros') {
    const isBad = value <= 0;
    return {
      font: {
        bold: true,
        color: { argb: isBad ? COLORS.profitBad : COLORS.profitGood },
      },
      fill: {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isBad ? COLORS.profitBadBg : COLORS.profitGoodBg },
      },
    };
  }
  return undefined;
};

const styleDataCell = (
  cell: ExcelJS.Cell,
  metric: ExportMetricDef,
  raw: string | number | null,
  columnVariant: ExportColumnVariant,
): void => {
  const rowBg = metricRowBg(metric.key);
  let colBg: string | undefined;
  if (columnVariant === 'total') colBg = COLORS.totalColBg;
  if (columnVariant === 'unmatched') colBg = COLORS.unmatchedColBg;

  const profitStyle =
    typeof raw === 'number' ? profitCellStyle(metric.key, raw) : undefined;

  if (
    columnVariant === 'unmatched' &&
    (metric.key === 'ads_spend' || metric.key === 'tax_ads') &&
    typeof raw === 'number' &&
    raw > 0
  ) {
    cell.font = { bold: true, color: { argb: COLORS.unmatchedHighlight } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.unmatchedHighlightBg },
    };
  } else if (profitStyle?.font) {
    cell.font = profitStyle.font;
    if (profitStyle.fill) cell.fill = profitStyle.fill;
  } else {
    cell.font = { bold: metric.emphasize ?? false, size: 11 };
    const bg = rowBg ?? colBg;
    if (bg) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: bg },
      };
    } else if (colBg) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: colBg },
      };
    }
  }

  cell.alignment = {
    vertical: 'middle',
    horizontal: typeof raw === 'string' && raw.includes('\n') ? 'left' : 'right',
    wrapText: true,
  };
  applyBorder(cell);

  if (typeof raw === 'number') {
    const fmt = numFmtFor(metric.format);
    if (fmt) cell.numFmt = fmt;
  }
};

const setCellValue = (
  cell: ExcelJS.Cell,
  raw: string | number | null,
): void => {
  if (raw == null) {
    cell.value = '—';
    return;
  }
  cell.value = raw;
};

const buildOverviewSheet = (
  workbook: ExcelJS.Workbook,
  input: MarketingSummaryExportInput,
): void => {
  const sheet = workbook.addWorksheet('Tổng quan', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  const headerRow = sheet.addRow(input.overviewHeaders);
  headerRow.eachCell((cell) => styleHeaderCell(cell));

  for (const row of input.overviewRows) {
    const dataRow = sheet.addRow(row.cells);
    dataRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      applyBorder(cell);
      cell.alignment = {
        vertical: 'middle',
        horizontal: colNumber >= 3 && colNumber <= 4 ? 'right' : 'left',
        wrapText: true,
      };
      if (typeof cell.value === 'number') {
        cell.numFmt = NUM_FMT.integer;
      }
      if (colNumber === 6 && typeof cell.value === 'number' && cell.value > 0) {
        cell.font = { bold: true, color: { argb: COLORS.unmatchedHighlight } };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.unmatchedHighlightBg },
        };
      }
    });
  }

  sheet.columns = input.overviewHeaders.map((header, index) => {
    if (index === 0) return { width: 22 };
    if (index === 4) return { width: 36 };
    if (index === 5) return { width: 18 };
    return { width: Math.max(14, header.length + 2) };
  });
};

const buildMetricsSheet = (
  workbook: ExcelJS.Workbook,
  input: MarketingSummaryExportInput,
): void => {
  const sheet = workbook.addWorksheet('Chi tiết', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 3 }],
  });

  const headerRow = sheet.addRow([
    'Chỉ số',
    ...input.metricColumns.map((col) => col.header),
  ]);
  headerRow.eachCell((cell, colNumber) => {
    const variant =
      colNumber > 1
        ? input.metricColumns[colNumber - 2]?.variant ?? 'default'
        : 'default';
    styleHeaderCell(cell, {
      align: colNumber === 1 ? 'left' : 'right',
      bg:
        variant === 'total'
          ? COLORS.totalColBg
          : variant === 'unmatched'
            ? COLORS.unmatchedColBg
            : COLORS.headerBg,
    });
  });

  const subheaderRow = sheet.addRow([
    '',
    ...input.metricColumns.map((col) => col.subheader ?? ''),
  ]);
  subheaderRow.eachCell((cell, colNumber) => {
    if (colNumber === 1) return;
    const variant = input.metricColumns[colNumber - 2]?.variant ?? 'default';
    styleHeaderCell(cell, {
      align: 'right',
      bg:
        variant === 'total'
          ? COLORS.totalColBg
          : variant === 'unmatched'
            ? COLORS.unmatchedColBg
            : COLORS.headerBg,
    });
    cell.font = { bold: false, size: 10, color: { argb: 'FF616161' } };
  });

  const quantityRow = sheet.addRow([
    '',
    ...input.metricColumns.map((col) => col.quantityLabel ?? ''),
  ]);
  quantityRow.eachCell((cell, colNumber) => {
    if (colNumber === 1) return;
    const variant = input.metricColumns[colNumber - 2]?.variant ?? 'default';
    styleHeaderCell(cell, {
      align: 'right',
      bg:
        variant === 'total'
          ? COLORS.totalColBg
          : variant === 'unmatched'
            ? COLORS.unmatchedColBg
            : COLORS.headerBg,
    });
    cell.font = { bold: false, size: 10, color: { argb: 'FF757575' } };
  });

  for (const metric of input.metricDefs) {
    const values = input.metricColumns.map((col) =>
      col.getValue(metric.key),
    );
    const row = sheet.addRow([metric.label, ...values]);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber === 1) {
        styleMetricLabelCell(cell, metric);
        return;
      }
      const col = input.metricColumns[colNumber - 2];
      const raw = col.getValue(metric.key);
      setCellValue(cell, raw);
      styleDataCell(cell, metric, raw, col.variant ?? 'default');
    });
  }

  sheet.getColumn(1).width = 24;
  for (let i = 0; i < input.metricColumns.length; i += 1) {
    const col = sheet.getColumn(i + 2);
    col.width = Math.max(16, input.metricColumns[i].header.length + 4);
  }
};

const triggerDownload = (buffer: ArrayBuffer, fileName: string): void => {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

export async function downloadMarketingSummaryExcel(
  input: MarketingSummaryExportInput,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HungViet Ads Control Panel';
  workbook.created = new Date();

  buildOverviewSheet(workbook, input);
  buildMetricsSheet(workbook, input);

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${sanitizeFileName(input.fileNameBase)}.xlsx`;
  triggerDownload(buffer, fileName);
}
