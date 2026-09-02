import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { writingRouter } from './routes/writing.js'

const app = express()
const port = Number(process.env.PORT) || 3001

app.use(cors())
app.use(express.json({ limit: '100kb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api', writingRouter)

app.listen(port, () => {
  console.log(`Backend running at http://localhost:${port}`)
})
