import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import tripRoutes from './routes/tripRoutes'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

app.use(cors())
app.use(express.json())

// API 路由
app.use('/api/trips', tripRoutes)

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`)
})
