import * as XLSX from 'xlsx';
import {
  parseProductRowsFromXls,
  parseVietnameseNumber,
} from './product-import.util';

describe('parseVietnameseNumber', () => {
  it('parses dot thousands separators', () => {
    expect(parseVietnameseNumber('750.000')).toBe(750000);
    expect(parseVietnameseNumber('1.500.000')).toBe(1500000);
    expect(parseVietnameseNumber('1.000')).toBe(1000);
  });

  it('parses comma thousands separators from Excel number formats', () => {
    expect(parseVietnameseNumber('750,000')).toBe(750000);
    expect(parseVietnameseNumber('1,500,000')).toBe(1500000);
  });

  it('parses numeric values without thousands separators', () => {
    expect(parseVietnameseNumber(429000)).toBe(429000);
    expect(parseVietnameseNumber(750)).toBe(750);
  });
});

describe('parseProductRowsFromXls', () => {
  function buildSampleBuffer(): Buffer {
    const rows = [
      [
        'STT',
        'Mã sản phẩm',
        'Tên sản phẩm gốc',
        'Giá nhập',
        'Đơn giá',
        'Khối lượng (gram)',
      ],
      ['1', 'SP1', 'Giày Nam', '750.000', '1.500.000', '300'],
      ['2', 'SP033', 'BÀN CHẢI TÂM ĐIỆN', '193.000', '429.000', '1.000'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    return XLSX.write(book, { type: 'buffer', bookType: 'xls' }) as Buffer;
  }

  it('reads numeric cells with Excel thousands formatting', () => {
    const rows = [
      [
        'STT',
        'Mã sản phẩm',
        'Tên sản phẩm gốc',
        'Giá nhập',
        'Đơn giá',
        'Khối lượng (gram)',
      ],
      ['1', 'SP1', 'Giày Nam', 750000, 1500000, 1000],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const setNumberFormat = (address: string, format: string) => {
      const cell = sheet[address] as { z?: string } | undefined;
      if (cell) {
        cell.z = format;
      }
    };
    setNumberFormat('D2', '#,##0');
    setNumberFormat('E2', '#,##0');
    setNumberFormat('F2', '#,##0');
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const buffer = XLSX.write(book, {
      type: 'buffer',
      bookType: 'xlsx',
    }) as Buffer;

    const { rows: parsed, errors } = parseProductRowsFromXls(buffer);
    expect(errors).toEqual([]);
    expect(parsed[0]).toMatchObject({
      item_code: 'SP1',
      cost_price: 750000,
      selling_price: 1500000,
      weight_gram: 1000,
    });
  });

  it('maps Vietnamese headers to product fields', () => {
    const { rows, errors } = parseProductRowsFromXls(buildSampleBuffer());
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      item_code: 'SP1',
      item_name: 'Giày Nam',
      cost_price: 750000,
      selling_price: 1500000,
      weight_gram: 300,
      delivery_fee: 0,
    });
    expect(rows[1]).toMatchObject({
      item_code: 'SP033',
      item_name: 'BÀN CHẢI TÂM ĐIỆN',
      cost_price: 193000,
      selling_price: 429000,
      weight_gram: 1000,
      delivery_fee: 0,
    });
  });

  it('reads delivery_fee from "Phí vận chuyển" column', () => {
    const rows = [
      [
        'Mã sản phẩm',
        'Tên sản phẩm gốc',
        'Giá nhập',
        'Đơn giá',
        'Khối lượng (gram)',
        'Phí vận chuyển',
      ],
      ['SP1', 'Giày Nam', '100.000', '200.000', '300', '15.000'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const buffer = XLSX.write(book, {
      type: 'buffer',
      bookType: 'xls',
    }) as Buffer;

    const { rows: parsed, errors } = parseProductRowsFromXls(buffer);
    expect(errors).toEqual([]);
    expect(parsed[0].delivery_fee).toBe(15000);
  });

  it('reads tax_value from "Import Tax" column', () => {
    const rows = [
      [
        'Mã sản phẩm',
        'Tên sản phẩm gốc',
        'Giá nhập',
        'Đơn giá',
        'Khối lượng (gram)',
        'Import Tax',
      ],
      ['SP1', 'Giày Nam', '100.000', '200.000', '300', '8,5'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const buffer = XLSX.write(book, {
      type: 'buffer',
      bookType: 'xls',
    }) as Buffer;

    const { rows: parsed, errors } = parseProductRowsFromXls(buffer);
    expect(errors).toEqual([]);
    expect(parsed[0].tax_value).toBe(8.5);
  });

  it('reads delivery_fee from "Delivery Fee" column', () => {
    const rows = [
      [
        'Mã sản phẩm',
        'Tên sản phẩm gốc',
        'Giá nhập',
        'Đơn giá',
        'Khối lượng (gram)',
        'Delivery Fee',
      ],
      ['SP1', 'Giày Nam', '100.000', '200.000', '300', '25.000'],
    ];
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Sheet1');
    const buffer = XLSX.write(book, {
      type: 'buffer',
      bookType: 'xls',
    }) as Buffer;

    const { rows: parsed, errors } = parseProductRowsFromXls(buffer);
    expect(errors).toEqual([]);
    expect(parsed[0].delivery_fee).toBe(25000);
  });
});
