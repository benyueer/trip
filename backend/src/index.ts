import express from 'express'
import cors from 'cors'
import session from 'express-session'
import pgSession from 'connect-pg-simple'
import { Pool } from 'pg'
import dotenv from 'dotenv'
import passport from './auth/passport'
import tripRoutes from './routes/tripRoutes'
import authRoutes from './routes/authRoutes'
import shareRoutes from './routes/shareRoutes'
import userRoutes from './routes/userRoutes'
import agentRoutes from './routes/agentRoutes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// Session store
const PgSession = pgSession(session)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}))
app.use(express.json({ limit: '50mb' }))

app.use(session({
  store: new PgSession({
    pool,
    tableName: 'session',
  }),
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
  },
}))

// Passport
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use('/auth', authRoutes)
app.use('/api/trips', tripRoutes)
app.use('/api/trips/:id/shares', shareRoutes)
app.use('/api/users', userRoutes)
app.use('/api/agent', agentRoutes)

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
