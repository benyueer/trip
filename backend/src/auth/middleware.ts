import { Request, Response, NextFunction } from 'express'

declare global {
  namespace Express {
    interface User {
      id: string
      email: string
      name: string
      avatar: string | null
      provider: string
      providerId: string
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next()
  }
  res.status(401).json({ error: 'Authentication required' })
}
