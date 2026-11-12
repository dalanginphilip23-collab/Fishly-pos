import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/Auth'
import Icon from '../components/Icon'
import { useTheme } from '../context/Theme'

export default function Login() {
  const { user, login } = useAuth()
  const { setLightOnly } = useTheme()
  const [username, setUsername] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showPin, setShowPin] = useState(false)
  useEffect(() => {
    setLightOnly(true)
    return () => setLightOnly(false)
  }, [setLightOnly])
  if (user) return <Navigate to="/" replace />
  const submit = async (event) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try { await login(username.trim(), pin) }
    catch (err) { setError(err.message); setPin('') }
    finally { setBusy(false) }
  }
  return <div className="login-page login-redesign flex flex-col">
    <main className="mx-auto flex w-full max-w-[1280px] flex-1 items-center px-4 py-3 sm:px-8 sm:py-6">
      <div className="login-stage page-enter grid w-full overflow-hidden rounded-3xl border lg:grid-cols-[1.05fr_1fr]">
      <section className="login-story relative flex min-w-0 flex-col items-center justify-center gap-6 overflow-hidden p-6 text-center sm:p-10 lg:p-12" aria-label="Fishly Poppers">
        <p className="relative z-10 text-xs font-medium uppercase tracking-[0.16em] text-blue-100">The team behind the counter</p>
        <img src="/logo.jpg" alt="Fishly Poppers — A Wavy Taste of Crunch!" className="relative z-10 aspect-square w-44 max-w-full rounded-3xl bg-white object-contain shadow-xl sm:w-56 lg:w-full lg:max-w-[380px]" />
        <div className="relative z-10 max-w-sm"><h2 className="text-2xl font-semibold tracking-tight text-white">Good food. Great service.</h2><p className="mt-3 text-sm leading-6 text-blue-100">From the first order to the day’s sales, your next shift starts here.</p></div>
        <div className="relative z-10 flex flex-wrap justify-center gap-x-5 gap-y-2 border-t border-white/20 pt-5 text-xs text-blue-100"><span className="flex items-center gap-2"><Icon name="register" className="!h-4 !w-4" />Cashier register</span><span className="flex items-center gap-2"><Icon name="chart" className="!h-4 !w-4" />Store management</span></div>
        <svg aria-hidden="true" className="pointer-events-none absolute bottom-0 right-0 h-full w-full opacity-10" viewBox="0 0 500 700" preserveAspectRatio="xMaxYMax slice" fill="none"><path d="M250 740C100 520 600 480 430 260S600 0 650-50M300 760C150 540 650 500 480 280S650 20 700-30M350 780C200 560 700 520 530 300S700 40 750-10" stroke="#69d9ff" strokeWidth="22" /></svg>
      </section>
      <section className="login-form-panel flex min-w-0 flex-col justify-center px-6 py-9 sm:px-10 sm:py-12 lg:px-12">
      <div className="mx-auto w-full max-w-[380px]">
        <div className="mb-8"><span className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-foam text-wave"><Icon name="lock" /></span><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Staff access</p><h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1><p className="mt-3 text-sm leading-6 text-slate-500">Sign in to take orders, manage your menu, or review your store’s performance.</p></div>
        <form onSubmit={submit} className="space-y-5" aria-busy={busy}>
          <label className="form-label">Username<span className="relative"><Icon name="user" className="pointer-events-none absolute left-3.5 top-3.5 !h-4 !w-4 text-slate-400" /><input required className="field !py-3 !pl-10" placeholder="Enter your username" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} disabled={busy} /></span></label>
          <div className="form-label"><label htmlFor="login-pin">PIN</label><div className="relative"><input id="login-pin" required className="field !py-3 !pr-20" placeholder="Your PIN" type={showPin ? 'text' : 'password'} inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} autoComplete="current-password" disabled={busy} /><button type="button" aria-label={showPin ? 'Hide PIN' : 'Show PIN'} aria-pressed={showPin} onClick={() => setShowPin(!showPin)} className="absolute inset-y-1 right-1 rounded-md px-3 text-xs font-semibold text-wave hover:bg-sky">{showPin ? 'Hide' : 'Show'}</button></div></div>
          {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-coral">{error}</p>}
          <button className="btn-primary flex w-full items-center justify-center gap-3 !py-3.5" disabled={!username.trim() || !pin || busy}>{busy ? 'Signing in…' : 'Sign in'}<Icon name={busy ? 'refresh' : 'arrow'} className={`!h-4 !w-4 ${busy ? 'animate-spin' : ''}`} /></button>
        </form>
        <div className="mt-7 border-t border-slate-200 pt-5"><p className="text-xs leading-6 text-slate-500">One workspace for sales, stock, and daily reports. Everyone starts at the register.</p><p className="mt-3 text-xs leading-6 text-slate-500"><span className="font-semibold text-ocean">Need help signing in?</span><br />Contact your store administrator for access.</p></div>
      </div>
      </section>
      </div>
    </main>
  </div>
}
