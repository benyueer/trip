import { Router } from 'express'
import passport from '../auth/passport'
import { userRepository } from '../repositories/UserRepository'

const router = Router()

// Dev login - auto login with a test user (only when no OAuth configured)
const hasOAuth = process.env.GOOGLE_CLIENT_ID || process.env.GITHUB_CLIENT_ID
if (!hasOAuth) {
  router.get('/dev-login', async (_req, res) => {
    try {
      const user = await userRepository.findOrCreateByProvider(
        'dev', 'dev-user', {
          email: 'dev@localhost',
          name: 'Dev User',
        }
      )
      _req.login(user, (err) => {
        if (err) {
          res.status(500).json({ error: 'Dev login failed' })
          return
        }
        res.json(user)
      })
    } catch (err) {
      res.status(500).json({ error: 'Dev login failed' })
    }
  })
}

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
