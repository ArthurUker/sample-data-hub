import { Request, Response, NextFunction } from 'express'
import { supabaseAnon } from '../lib/supabase'

export interface AuthenticatedRequest extends Request {
  userId?: string
  userRole?: string
}

/**
 * Verify Supabase Bearer JWT.
 * Attaches userId and userRole to the request object.
 */
export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }

  const token = authHeader.slice(7)
  const { data, error } = await supabaseAnon.auth.getUser(token)

  if (error || !data.user) {
    res.status(401).json({ error: 'Invalid or expired token' })
    return
  }

  req.userId = data.user.id

  // Fetch role from profiles table
  const { data: profile } = await supabaseAnon
    .from('profiles')
    .select('role')
    .eq('id', data.user.id)
    .single()

  req.userRole = (profile as { role?: string } | null)?.role ?? 'VIEWER'
  next()
}

/**
 * Require one of the given roles. Must be used after requireAuth.
 */
export function requireRole(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.userRole || !roles.includes(req.userRole)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}
