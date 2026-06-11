import {
  OrderStatus,
  PUSHSALE_ORDER_STATUS_LABELS,
} from '@sync-project/shared';

const PUSHSALE_LABEL_TO_STATUS = new Map<string, OrderStatus>(
  Object.entries(PUSHSALE_ORDER_STATUS_LABELS).map(([code, label]) => [
    label,
    code as OrderStatus,
  ]),
);

/** Strip Vietnamese diacritics; `đ`/`Đ` are handled explicitly. */
export function removeVietnameseDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/**
 * Slugify a PushSale status label when it is not in {@link OrderStatus}:
 * remove diacritics, uppercase, join words with `_`.
 */
export function slugifyPushSaleOrderStatusName(name: string): string {
  return removeVietnameseDiacritics(name.trim())
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '');
}

/**
 * Resolve PushSale `orderStatusName` to an internal status code.
 * Known labels use {@link OrderStatus}; unknown labels are slugified.
 */
export function resolveOrderStatusFromPushSale(
  orderStatusName: string | undefined | null,
): string | undefined {
  const trimmed = String(orderStatusName ?? '').trim();
  if (!trimmed) {
    return undefined;
  }

  const mapped = PUSHSALE_LABEL_TO_STATUS.get(trimmed);
  if (mapped) {
    return mapped;
  }

  return slugifyPushSaleOrderStatusName(trimmed);
}
