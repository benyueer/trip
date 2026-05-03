import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import { Strategy as GitHubStrategy } from 'passport-github2'
import { userRepository } from '../repositories/UserRepository'

// Serialize user ID into session
passport.serializeUser((user: any, done) => {
  done(null, user.id)
})

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await userRepository.findById(id)
    done(null, user)
  } catch (err) {
    done(err)
  }
})

// Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: '/auth/google/callback',
  }, async (_accessToken, _refreshToken, profile, done) => {
    try {
      const user = await userRepository.findOrCreateByProvider(
        'google',
        profile.id,
        {
          email: profile.emails?.[0]?.value || '',
          name: profile.displayName,
          avatar: profile.photos?.[0]?.value,
        }
      )
      done(null, user)
    } catch (err) {
      done(err as Error)
    }
  }))
}

// GitHub Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
    clientID: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    callbackURL: '/auth/github/callback',
  }, async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
    try {
      const email = profile.emails?.[0]?.value || `${profile.username}@github.local`
      const user = await userRepository.findOrCreateByProvider(
        'github',
        profile.id,
        {
          email,
          name: profile.displayName || profile.username,
          avatar: profile.photos?.[0]?.value,
        }
      )
      done(null, user)
    } catch (err) {
      done(err)
    }
  }))
}

export default passport
