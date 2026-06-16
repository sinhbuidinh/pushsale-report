export enum SyncTriggerSource {
  Cron = 'cron',
  /** Daily re-fetch of orders created 7 calendar days ago (PushSale fields may still change). */
  CronSevenDayRefresh = 'cron_seven_day_refresh',
  /** 1st of month: re-fetch all orders from the previous calendar month. */
  CronMonthlyRefresh = 'cron_monthly_refresh',
  Api = 'api',
}
