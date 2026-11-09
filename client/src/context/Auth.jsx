import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const expire = () => setUser(null)
    window.addEventListener('auth:expired', expire)
    return () => window.removeEventListener('auth:expired', expire)
  }, [])

  useEffect(() => {
    if (!localStorage.getItem('fp_token')) return setReady(true)
    api('/auth/me').then(setUser).catch(() => {}).finally(() => setReady(true))
  }, [])

  const login = async (username, pin) => {
    localStorage.removeItem('fp_admin_unlocked')
    const data = await api('/auth/login', { method: 'POST', body: { username, pin } })
    localStorage.setItem('fp_token', data.token)
    setUser(data.user)
  }

  const logout = () => {
    localStorage.removeItem('fp_token')
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>
}
