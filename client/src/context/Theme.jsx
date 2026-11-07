import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => document.documentElement.classList.contains('dark') ? 'dark' : 'light')
  const [lightOnly, setLightOnly] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => {
      try { if (localStorage.getItem('fp_theme')) return } catch {}
      setTheme(media.matches ? 'dark' : 'light')
    }
    const storage = (event) => { if (event.key === 'fp_theme') setTheme(event.newValue === 'dark' || (!event.newValue && media.matches) ? 'dark' : 'light') }
    media.addEventListener('change', sync)
    window.addEventListener('storage', storage)
    return () => { media.removeEventListener('change', sync); window.removeEventListener('storage', storage) }
  }, [])
  useEffect(() => {
    const effective = lightOnly ? 'light' : theme
    document.documentElement.classList.toggle('dark', effective === 'dark')
    document.documentElement.style.colorScheme = effective
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective === 'dark' ? '#111820' : '#f6f7f9')
  }, [theme, lightOnly])
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    try { localStorage.setItem('fp_theme', next) } catch {}
    setTheme(next)
  }
  return <ThemeContext.Provider value={{ theme, toggle, setLightOnly }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => useContext(ThemeContext)
