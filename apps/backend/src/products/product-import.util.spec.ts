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

  it('returns numbers as-is', () => {
    expect(parseVietnameseNumber(429000)).toBe(429000);
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

  it('maps Vietnamese headers to product fields', () => {
    const { rows, errors } = parseProductRowsFromXls(buildSampleBuffer());
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      item_code: 'Giày Nam',
      item_name: 'SP1',
      cost_price: 750000,
      selling_price: 1500000,
      weight_gram: 300,
    });
    expect(rows[1]).toMatchObject({
      item_code: 'BÀN CHẢI TÂM ĐIỆN',
      item_name: 'SP033',
      cost_price: 193000,
      selling_price: 429000,
      weight_gram: 1000,
    });
  });
});
