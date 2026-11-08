import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/Auth'
import Shell from './components/Shell'
import Login from './pages/Login'
import Pos from './pages/Pos'
import Orders from './pages/Orders'
import Dashboard from './pages/Dashboard'
import Products from './pages/Products'
import Customers from './pages/Customers'
import Stock from './pages/Stock'
import Inventory from './pages/Inventory'

function Guard({ cashier, children }) {
  const { user, ready } = useAuth()
  if (!ready) return <div className="grid min-h-screen place-items-center text-sm text-slate-500" role="status">Opening your workspace…</div>
  if (!user) return <Navigate to="/login" replace />
  if (cashier && user.role !== 'cashier') return <Navigate to="/dashboard" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Guard><Shell /></Guard>}>
        <Route index element={<Guard cashier><Pos /></Guard>} />
        <Route path="orders" element={<Orders />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="products" element={<Products />} />
      <Route path="customers" element={<Customers />} />
      <Route path="stock" element={<Stock />} />
      <Route path="inventory" element={<Inventory />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
