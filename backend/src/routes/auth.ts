import { Router, Response } from 'express'
import rateLimit from 'express-rate-limit'
import { supabaseAdmin, supabaseAnon } from '../lib/supabase'

const router = Router()

/**
 * Rate limiter: max 10 login attempts per IP per 15 minutes.
 * This mitigates brute-force attacks on the login endpoint.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const name =
      typeof req.body?.username === 'string'
        ? req.body.username.trim().toLowerCase()
        : ''
    return `${req.ip}:${name}`
  },
  handler: async (req, res) => {
    const username =
      typeof req.body?.username === 'string'
        ? req.body.username.trim()
        : '__unknown__'

    await logLoginAttempt({
      username,
      ip: req.ip,
      success: false,
      reason: 'rate_limited',
    })

    res.status(429).json({
      error: 'Too many login attempts. Please try again later.',
    })
  },
})

const logLoginAttempt = async (params: {
  username: string
  ip?: string
  success: boolean
  reason: string
  userId?: string
}) => {
  const { error } = await supabaseAdmin.from('login_attempt_logs').insert({
    username: params.username,
    ip: params.ip,
    success: params.success,
    reason: params.reason,
    user_id: params.userId,
  })

  if (error) {
    console.error('[auth] login_attempt_logs insert failed', error.message)
  }
}

/**
 * POST /api/auth/login
 * Username + password login without exposing email lookup to the browser.
 */
router.post('/login', loginRateLimiter, async (req, res: Response) => {
  const username =
    typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''

  if (!username || !password) {
    await logLoginAttempt({
      username: username || '__empty__',
      ip: req.ip,
      success: false,
      reason: 'missing_credentials',
    })
    res.status(400).json({ error: 'Username and password are required' })
    return
  }

  const { data: email, error: emailError } = await supabaseAdmin.rpc(
    'get_email_by_username',
    { username }
  )

  if (emailError) {
    await logLoginAttempt({
      username,
      ip: req.ip,
      success: false,
      reason: 'rpc_error',
    })
    console.error('[auth] login rpc failed', {
      username,
      ip: req.ip,
      ts: new Date().toISOString(),
      error: emailError.message,
    })
    res.status(500).json({ error: 'Login service unavailable' })
    return
  }

  if (typeof email !== 'string' || !email) {
    await logLoginAttempt({
      username,
      ip: req.ip,
      success: false,
      reason: 'username_not_found',
    })
    console.warn('[auth] login attempt: username not found', {
      username,
      ip: req.ip,
      ts: new Date().toISOString(),
    })
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }

  const { data: signInData, error: signInError } =
    await supabaseAnon.auth.signInWithPassword({
      email,
      password,
    })

  if (signInError || !signInData.session) {
    await logLoginAttempt({
      username,
      ip: req.ip,
      success: false,
      reason: 'invalid_password',
    })
    console.warn('[auth] login attempt: invalid password', {
      username,
      ip: req.ip,
      ts: new Date().toISOString(),
    })
    res.status(401).json({ error: 'Invalid username or password' })
    return
  }

  const userId = signInData.user?.id ?? signInData.session.user.id

  await logLoginAttempt({
    username,
    ip: req.ip,
    success: true,
    reason: 'success',
    userId,
  })

  console.info('[auth] login success', {
    userId,
    username,
    ip: req.ip,
    ts: new Date().toISOString(),
  })

  // Write to persistent audit log (best-effort, do not block the response)
  supabaseAdmin
    .from('audit_logs')
    .insert({
      user_id: userId,
      action: 'LOGIN',
      entity_type: 'auth',
      entity_id: userId,
      detail: { username, ip: req.ip },
    })
    .then(({ error }) => {
      if (error) console.error('[auth] audit_log insert failed', error.message)
    })

  res.json({
    accessToken: signInData.session.access_token,
    refreshToken: signInData.session.refresh_token,
    expiresIn: signInData.session.expires_in,
    tokenType: signInData.session.token_type,
    user: { id: userId },
  })
})

export default router
