import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import healthRouter from './routes/health'
import exportRouter from './routes/export'
import importRouter from './routes/import'
import samplesRouter from './routes/samples'

const app = express()
const PORT = parseInt(process.env.PORT ?? '4000', 10)

// ——— CORS ———
const allowedOrigin = process.env.CORS_ALLOW_ORIGIN ?? '*'
app.use(
  cors({
    origin: allowedOrigin === '*' ? '*' : allowedOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

// ——— Body parsing ———
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// ——— Routes ———
app.use('/health', healthRouter)
app.use('/api/export', exportRouter)
app.use('/api/import', importRouter)
app.use('/api/samples', samplesRouter)

// ——— 404 fallback ———
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// ——— Global error handler ———
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[error]', err.message)
    res.status(500).json({ error: 'Internal server error' })
  }
)

app.listen(PORT, () => {
  console.log(`[backend] listening on http://localhost:${PORT}`)
})

export default app
