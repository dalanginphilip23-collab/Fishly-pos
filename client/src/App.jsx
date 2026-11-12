import { Navigate, Route, Routes } from 'react-router-dom'
import { lazy } from 'react'
import { useAuth } from './context/Auth'
import Shell from './components/Shell'
import Login from './pages/Login'
const Pos = lazy(() => import('./pages/Pos'))
const Orders = lazy(() => import('./pages/Orders'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Products = lazy(() => import('./pages/Products'))
const Customers = lazy(() => import('./pages/Customers'))
const Stock = lazy(() => import('./pages/Stock'))
const Inventory = lazy(() => import('./pages/Inventory'))
const Staff = lazy(() => import('./pages/Staff'))

function Guard({ children }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-500" role="status">Opening your workspace…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Shell /></Guard>}>
        <Route index element={<Pos />} />
        <Route path="orders" element={<Orders />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="stock" element={<Stock />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="staff" element={<Staff />} />
        <Route path="shifts" element={<Navigate to="/" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
