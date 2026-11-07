import { useTheme } from '../context/Theme'
import Icon from './Icon'

export default function ThemeToggle({ compact = false }) {
  const { theme, toggle } = useTheme()
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`
  return <button type="button" onClick={toggle} aria-label={label} title={label} className="theme-toggle inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium">
    <Icon name={theme === 'dark' ? 'sun' : 'moon'} />{!compact && <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
  </button>
}
