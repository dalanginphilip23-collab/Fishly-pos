import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.js'
import productRoutes from './routes/products.js'
import orderRoutes from './routes/orders.js'
import reportRoutes, { serveReceipt } from './routes/reports.js'
import customerRoutes from './routes/customers.js'
import stockRoutes from './routes/stock.js'
import supplierRoutes from './routes/suppliers.js'
import purchaseRoutes from './routes/purchases.js'
import shiftRoutes from './routes/shifts.js'
import { photoDirectory } from './photos.js'
import { auth } from './middleware/auth.js'
import { ensureDefaultUsers } from './seed.js'
import { migrateSchema } from './migrate.js'

const app = express()
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'change-me' || process.env.JWT_SECRET.length < 32) {
  throw new Error('Set a JWT_SECRET of at least 32 characters in server/.env')
}
if (process.env.NODE_ENV === 'production' && !process.env.CLIENT_URL) {
  throw new Error('Set CLIENT_URL to the public client origin')
}
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1)
app.disable('x-powered-by')
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
})
app.use(cors({ origin: process.env.CLIENT_URL }))
app.use(express.json({ limit: '64kb' }))
app.use('/api/uploads/photos', express.static(photoDirectory, { dotfiles: 'deny', index: false, setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff') }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/products', productRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api/reports', reportRoutes)
// Receipts saved before the signed-in receipt endpoint existed still resolve.
app.get('/api/uploads/receipts/:filename', auth(), serveReceipt)
app.use('/api/customers', customerRoutes)
app.use('/api/stock', stockRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/shifts', shiftRoutes)
app.use((_req, res) => res.status(404).json({ message: 'Endpoint not found' }))

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ message: 'File or request is too large. Product photos must be 5 MB or smaller.' })
  if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ message: 'That code already exists' })
  if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'The selected record no longer exists' })
  if (!err.status) console.error(err)
  res.status(err.status || 500).json({ message: err.status ? err.message : 'Server error' })
})

await migrateSchema()
await ensureDefaultUsers()
app.listen(process.env.PORT || 4000, () => console.log('API running on port', process.env.PORT || 4000))
