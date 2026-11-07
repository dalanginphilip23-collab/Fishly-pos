import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider, useAuth } from './context/Auth'
import { CartProvider } from './context/Cart'
import './index.css'
import { ThemeProvider } from './context/Theme'

function SessionApp() {
  const { user } = useAuth()
  return <CartProvider key={user?.id || 'guest'}><App /></CartProvider>
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ThemeProvider><BrowserRouter>
    <AuthProvider>
      <SessionApp />
    </AuthProvider>
  </BrowserRouter></ThemeProvider>
)
