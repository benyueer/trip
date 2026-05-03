import { Router } from 'express'
import passport from '../auth/passport'

const router = Router()

// Get current user
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user)
  } else {
    res.status(401).json({ error: 'Not authenticated' })
  }
})

// Logout
router.post('/logout', (req, res) => {
  req.logout((err) => {
    if (err) {
      res.status(500).json({ error: 'Logout failed' })
      return
    }
    res.json({ success: true })
  })
})

// Google OAuth
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
}))

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/' }),
  (_req, res) => {
    res.redirect(process.env.CLIENT_URL || '/')
  }
)

// GitHub OAuth
router.get('/github', passport.authenticate('github', {
  scope: ['user:email'],
}))

router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/' }),
  (_req, res) => {
    res.redirect(process.env.CLIENT_URL || '/')
  }
)

export default router
