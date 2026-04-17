/**
 * PushSale `typeDate` values for GetOrderByConditions.
 */
export enum PushSaleTypeDate {
  /** 1 — Ngày sale tác nghiệp */
  SaleProcessDate = '1',
  /** 2 — Ngày tạo */
  CreatedDate = '2',
  /** 3 — Ngày sale nhận data */
  SaleReceiveData = '3',
  /** 4 — Ngày chốt */
  CloseDate = '4',
  /** 5 — Ngày đăng đơn */
  CreateOrderDate = '5',
  /** 6 — Ngày đối soát */
  ReconciliationDate = '6',
  /** 7 — Ngày care đơn nhận data */
  CareOrderReceiveData = '7',
  /** 8 — Ngày tác nghiệp care đơn */
  CareOrderProcessDate = '8',
}
