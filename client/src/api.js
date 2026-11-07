const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export const photoUrl = (path) => path ? base + path.slice('/api'.length) : ''

async function readError(res, token) {
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) {
    localStorage.removeItem('fp_token')
    window.dispatchEvent(new Event('auth:expired'))
  }
  return new Error(data.message || 'Something went wrong')
}

export async function api(path, { method = 'GET', body, signal } = {}) {
  const token = localStorage.getItem('fp_token')
  const isFile = body instanceof Blob
  const res = await fetch(base + path, {
    method,
    signal,
    headers: { 'Content-Type': isFile ? body.type : 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: isFile ? body : body && JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && token) {
      localStorage.removeItem('fp_token')
      window.dispatchEvent(new Event('auth:expired'))
    }
    throw new Error(data.message || 'Something went wrong')
  }
  return data
}

export async function download(path, filename) {
  const token = localStorage.getItem('fp_token')
  const res = await fetch(base + path, { headers: { ...(token && { Authorization: `Bearer ${token}` }) } })
  if (!res.ok) throw await readError(res, token)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
