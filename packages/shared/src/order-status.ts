/** Internal order status codes mapped from PushSale `orderStatusName`. */
export enum OrderStatus {
  DaLayHang = 'DA_LAY_HANG',
  DangGiaoHang = 'DANG_GIAO_HANG',
  DaGiaoHang = 'DA_GIAO_HANG',
  DaThanhToan = 'DA_THANH_TOAN',
  DaDang = 'DA_DANG',
  ChoChotDon = 'CHO_CHOT_DON',
  ChotDon = 'CHOT_DON',
}

/** PushSale display labels keyed by {@link OrderStatus}. */
export const PUSHSALE_ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  [OrderStatus.DaLayHang]: 'Đã lấy hàng',
  [OrderStatus.DangGiaoHang]: 'Đang giao hàng',
  [OrderStatus.DaGiaoHang]: 'Đã giao hàng',
  [OrderStatus.DaThanhToan]: 'Đã thanh toán',
  [OrderStatus.DaDang]: 'Đã đăng',
  [OrderStatus.ChoChotDon]: 'Chờ chốt đơn',
  [OrderStatus.ChotDon]: 'Chốt đơn',
};

/** Order statuses used for the delivered/paid marketing summary mode. */
export const DELIVERED_OR_PAID_ORDER_STATUSES: OrderStatus[] = [
  OrderStatus.DaGiaoHang,
  OrderStatus.DaThanhToan,
];
