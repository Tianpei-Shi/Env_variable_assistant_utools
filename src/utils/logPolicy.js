// Data/log retention policy for commercial-grade stability.
// Keep persisted records bounded to prevent long-term storage growth.
export const LOG_POLICY = {
  // Keep latest backups only.
  maxBackups: 30,
  // Keep latest operation-history records per tab type.
  maxTrashRecordsPerType: 500,
  // Background cleanup cadence.
  autoCleanupIntervalMs: 10 * 60 * 1000,
}

export default LOG_POLICY
