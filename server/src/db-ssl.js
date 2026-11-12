export function getSSLConfig(env = process.env) {
  const local = ['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST?.trim().toLowerCase())
  const hasCertificate = Boolean(env.DB_CA_CERT_BASE64 || env.DB_CA_CERT)
  const localDefault = env.DB_SSL === undefined && local && !hasCertificate && env.NODE_ENV !== 'production'
  if (env.DB_SSL === 'false' || localDefault) {
    if (env.NODE_ENV === 'production') throw new Error('SSL must be enabled in production')
    return undefined
  }

  const ca = env.DB_CA_CERT_BASE64
    ? Buffer.from(env.DB_CA_CERT_BASE64, 'base64').toString('utf8')
    : env.DB_CA_CERT?.replace(/\\n/g, '\n')
  if (!ca || !ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
    throw new Error('Database SSL requires a CA certificate. Set DB_CA_CERT or DB_CA_CERT_BASE64 in server/.env. For local development MySQL, use DB_SSL=false.')
  }
  return { ca, rejectUnauthorized: true }
}
