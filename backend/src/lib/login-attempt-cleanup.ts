import { supabaseAdmin } from './supabase'

const retentionDays = parseInt(
  process.env.LOGIN_ATTEMPT_LOG_RETENTION_DAYS ?? '90',
  10
)

const cleanupIntervalHours = parseInt(
  process.env.LOGIN_ATTEMPT_CLEANUP_INTERVAL_HOURS ?? '24',
  10
)

async function cleanupLoginAttemptLogs() {
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  const { error } = await supabaseAdmin
    .from('login_attempt_logs')
    .delete()
    .lt('created_at', cutoff.toISOString())

  if (error) {
    console.error('[auth] login_attempt_logs cleanup failed', error.message)
    return
  }

  console.info('[auth] login_attempt_logs cleanup finished', {
    retentionDays,
    cutoff: cutoff.toISOString(),
  })
}

export function startLoginAttemptCleanupJob() {
  // Run once on startup.
  void cleanupLoginAttemptLogs()

  // Then run periodically; unref avoids keeping process alive solely for this timer.
  const timer = setInterval(
    () => void cleanupLoginAttemptLogs(),
    cleanupIntervalHours * 60 * 60 * 1000
  )
  timer.unref()
}
