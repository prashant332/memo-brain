import pg from 'pg'
import dotenv from 'dotenv'

// Load env vars before creating pool
dotenv.config()

const { Pool } = pg

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'memobrain',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
})

export default pool
