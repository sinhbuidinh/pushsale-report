import { OrderStatus } from '@sync-project/shared';
import {
  removeVietnameseDiacritics,
  resolveOrderStatusFromPushSale,
  slugifyPushSaleOrderStatusName,
} from './order-status.util';

describe('resolveOrderStatusFromPushSale', () => {
  it('maps known PushSale labels to OrderStatus codes', () => {
    expect(resolveOrderStatusFromPushSale('Đã lấy hàng')).toBe(
      OrderStatus.DaLayHang,
    );
    expect(resolveOrderStatusFromPushSale('Đang giao hàng')).toBe(
      OrderStatus.DangGiaoHang,
    );
    expect(resolveOrderStatusFromPushSale('Đã đăng')).toBe(OrderStatus.DaDang);
    expect(resolveOrderStatusFromPushSale('Chờ chốt đơn')).toBe(
      OrderStatus.ChoChotDon,
    );
    expect(resolveOrderStatusFromPushSale('Chốt đơn')).toBe(
      OrderStatus.ChotDon,
    );
  });

  it('slugifies unknown labels', () => {
    expect(resolveOrderStatusFromPushSale('Đang xử lý')).toBe('DANG_XU_LY');
  });

  it('returns undefined for empty input', () => {
    expect(resolveOrderStatusFromPushSale('')).toBeUndefined();
    expect(resolveOrderStatusFromPushSale(null)).toBeUndefined();
  });
});

describe('slugifyPushSaleOrderStatusName', () => {
  it('removes diacritics, uppercases, and joins with underscore', () => {
    expect(slugifyPushSaleOrderStatusName('Đã lấy hàng')).toBe('DA_LAY_HANG');
    expect(slugifyPushSaleOrderStatusName('Đang giao hàng')).toBe(
      'DANG_GIAO_HANG',
    );
  });
});

describe('removeVietnameseDiacritics', () => {
  it('handles đ/Đ', () => {
    expect(removeVietnameseDiacritics('Chốt đơn')).toBe('Chot don');
  });
});
