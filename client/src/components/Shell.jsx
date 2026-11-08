import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/Auth'
import { useCart } from '../context/Cart'
import Icon from './Icon'
import ThemeToggle from './ThemeToggle'
import { Fragment, useEffect, useState } from 'react'

const adminPaths = ['/dashboard', '/products', '/customers', '/stock', '/inventory']

export default function Shell() {
  const { user, logout } = useAuth()
  const { count } = useCart()
  const location = useLocation()
  const navigate = useNavigate()
  const isAdmin = user.role === 'admin'
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const saved = localStorage.getItem('fp_sidebar_collapsed')
      if (saved !== null) return saved === 'true'
    } catch {}
    return window.matchMedia('(min-width: 768px) and (max-width: 1279px)').matches
  })
  const [adminMode, setAdminMode] = useState(() => {
    if (isAdmin) return true
    if (adminPaths.includes(window.location.pathname)) return true
    if (window.location.pathname === '/') return false
    try { return sessionStorage.getItem('fp_admin_mode') === 'true' } catch { return false }
  })

  // The cashier sidebar stays focused on the register. Opening an admin page
  // switches the navigation into admin mode, and returning to the register exits it.
  useEffect(() => {
    if (isAdmin) return
    if (adminPaths.includes(location.pathname)) setAdminMode(true)
    if (location.pathname === '/') setAdminMode(false)
  }, [isAdmin, location.pathname])

  useEffect(() => {
    try { sessionStorage.setItem('fp_admin_mode', String(adminMode)) } catch {}
  }, [adminMode])

  const toggleSidebar = () => {
    const next = !collapsed
    setCollapsed(next)
    try { localStorage.setItem('fp_sidebar_collapsed', String(next)) } catch {}
  }
  const inAdminMode = isAdmin || adminMode
  const groups = inAdminMode
    ? [
        { id: 'overview', label: 'Overview', links: [['/dashboard', 'Analytics', 'chart']] },
        { id: 'sales', label: 'Sales', links: [['/orders', 'Orders', 'orders']] },
        { id: 'catalog', label: 'Catalog', links: [['/inventory', 'Inventory', 'grid'], ['/products', 'Products', 'bag']] },
        { id: 'people', label: 'People', links: [['/customers', 'Customers', 'user']] },
      ]
    : [{ id: 'cashier', links: [['/', 'Register', 'register'], ['/orders', 'Receipts', 'orders']] }]
  return (
    <div className="app-shell flex flex-col overflow-hidden md:flex-row">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-white p-3 font-bold text-wave focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
      <aside id="workspace-sidebar" className={`brand-sidebar workspace-sidebar flex shrink-0 flex-col border-b md:border-b-0 md:border-r ${collapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="sidebar-heading flex items-center gap-2 px-3 py-4">
          <button type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-navigation" title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={toggleSidebar} className="theme-toggle flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"><Icon name="menu" /></button>
          <img src="/logo.jpg" alt="Fishly Poppers" className="h-9 w-9 shrink-0 rounded-full object-cover" /><div className="sidebar-label min-w-0"><p className="whitespace-nowrap text-sm font-semibold leading-tight">Fishly Poppers</p><p className="mt-1 whitespace-nowrap text-xs text-slate-500">{inAdminMode ? 'Administration' : 'Point of sale'}</p></div>
          {!isAdmin && inAdminMode && <button type="button" onClick={() => { setAdminMode(false); navigate('/') }} className="theme-toggle ml-auto flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold md:hidden" aria-label="Back to cashier"><Icon name="register" /><span>Cashier</span></button>}
          <div className="ml-auto flex items-center md:hidden"><ThemeToggle compact /><button aria-label="Sign out" className="theme-toggle rounded-lg p-2" onClick={() => (!count || window.confirm('Sign out and discard the current cart?')) && logout()}><Icon name="logout" /></button></div>
        </div>
        <nav id="workspace-navigation" aria-label="Main navigation" className="grid grid-cols-2 gap-1 px-3 pb-3 md:flex md:flex-col md:gap-2">
          {groups.map((group) => <Fragment key={group.id}>
            {group.label && <p className="sidebar-label mt-3 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 first:mt-0">{group.label}</p>}
            {group.links.map(([to, label, icon]) => <NavLink key={to} to={to} end={to === '/'} title={label} aria-label={label} className={({ isActive }) => `nav-item flex flex-1 items-center justify-center gap-3 rounded-lg px-3 py-3 text-xs font-medium transition md:flex-none md:justify-start md:text-sm ${isActive ? 'nav-active' : ''}`}>
              <Icon name={icon} /><span className="sidebar-label whitespace-nowrap">{label}</span>
            </NavLink>)}
          </Fragment>)}
        </nav>
        <div className="sidebar-footer mt-auto hidden border-t border-slate-200 p-3 md:block">
          <div className="sidebar-utility mb-4 flex"><ThemeToggle compact /></div>

          <button title="Sign out" aria-label="Sign out" onClick={() => (!count || window.confirm('Sign out and discard the current cart?')) && logout()} className="sidebar-utility theme-toggle mt-4 flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm"><Icon name="logout" /><span className="sidebar-label">Sign out</span></button>
        </div>
      </aside>
      <main id="main-content" tabIndex={-1} className="flex min-h-0 min-w-0 flex-1 flex-col">
        {!isAdmin && inAdminMode && <div className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:px-6"><span className="text-sm font-semibold text-slate-600">Administration mode</span><button type="button" onClick={() => { setAdminMode(false); navigate('/') }} className="btn-ghost flex items-center gap-2 text-sm"><Icon name="register" /><span>Cashier</span></button></div>}
        <div className="min-h-0 flex-1"><Outlet /></div>
      </main>
    </div>
  )
}
