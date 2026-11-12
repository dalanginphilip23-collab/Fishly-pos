const base = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export const photoUrl = (path) => path ? base + path.slice('/api'.length) : ''

async function readError(res, token) {
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && token) {
    localStorage.removeItem('fp_token')
    window.dispatchEvent(new Event('auth:expired'))
  }
  const error = new Error(data.message || 'Something went wrong')
  error.status = res.status
  return error
}

async function request(path, { method = 'GET', body, signal, timeout = 30000 } = {}) {
  const token = localStorage.getItem('fp_token')
  const isFile = body instanceof Blob
  const controller = signal ? null : new AbortController()
  const timer = controller ? setTimeout(() => controller.abort(), timeout) : null
  try {
    const res = await fetch(base + path, {
      method,
      signal: signal || controller?.signal,
      headers: { 'Content-Type': isFile ? body.type : 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
      body: isFile ? body : body && JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 401 && token) {
        localStorage.removeItem('fp_token')
        window.dispatchEvent(new Event('auth:expired'))
      }
      const error = new Error(data.message || 'Something went wrong')
      error.status = res.status
      throw error
    }
    return data
  } catch (error) {
    if (error.name === 'AbortError') {
      // Navigation/search cancellation is intentional, not a network failure.
      if (signal?.aborted) throw error
      const timeoutError = new Error('The server did not respond. Check the connection before trying again.')
      timeoutError.code = 'NETWORK'
      throw timeoutError
    }
    if (error instanceof TypeError) {
      const networkError = new Error('Cannot reach the server. Check the connection before trying again.')
      networkError.code = 'NETWORK'
      throw networkError
    }
    throw error
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export const api = request

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

export async function openFile(path) {
  const token = localStorage.getItem('fp_token')
  // Open the tab synchronously so browsers do not treat the delayed navigation
  // as an unsolicited popup.
  const popup = window.open('', '_blank')
  try {
    const res = await fetch(base + path, { headers: { ...(token && { Authorization: `Bearer ${token}` }) } })
    if (!res.ok) throw await readError(res, token)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    if (popup) {
      popup.opener = null
      popup.location.href = url
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  } catch (error) {
    popup?.close()
    throw error
  }
}
