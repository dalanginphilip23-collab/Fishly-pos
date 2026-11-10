import { useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { money } from '../utils'

function ReceiptContent({ order }) {
  return <>
    <header className="receipt-heading">
      <h3>Fishly Poppers</h3>
      <p>A Wavy Taste of Crunch!</p>
      <p className="receipt-number">{order.order_no}</p>
      <p>{order.order_type === 'dine_in' ? 'Dine in' : 'Take out'}</p>
      <p>{new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
    </header>
    <hr />
    {order.status === 'cancelled' && <p className="receipt-cancelled">CANCELLED</p>}
    {order.refund && <p className="receipt-cancelled">REFUNDED {order.refund.reason ? `· ${order.refund.reason}` : ''}</p>}
    {order.items.map((item) => <div key={item.id} className="receipt-row receipt-item">
      <span>{item.qty} × {item.name}</span>
      <span>{money(Math.round(item.price * 100) * item.qty / 100)}</span>
    </div>)}
    <hr />
    {order.discount > 0 && <><div className="receipt-row"><span>Subtotal</span><span>{money(order.subtotal)}</span></div><div className="receipt-row"><span>Discount</span><span>−{money(order.discount)}</span></div></>}
    <div className="receipt-row receipt-total"><span>TOTAL</span><span>{money(order.total)}</span></div>
    <div className="receipt-row"><span>{order.payment_method === 'cash' ? 'Cash' : 'GCash'}</span><span>{money(order.cash_received ?? order.total)}</span></div>
    {order.payment_reference && <div className="receipt-row"><span>GCash ref.</span><span>{order.payment_reference}</span></div>}
    {order.change_due != null && <div className="receipt-row"><span>Change</span><span>{money(order.change_due)}</span></div>}
    <hr />
    <p className="receipt-thanks">Thank you! Come back soon.</p>
  </>
}

export default function Receipt({ order }) {
  const [paper, setPaper] = useState(() => localStorage.getItem('fp_receipt_paper') === '80' ? '80' : '58')
  const printRef = useRef(null)
  const pageStyleRef = useRef(null)

  useLayoutEffect(() => {
    const receipt = printRef.current
    const updatePageSize = () => {
      // Measure the full-size offscreen copy, never the responsive modal preview.
      // CSS uses 96 px per inch. Round up and allow 2 mm for print rounding.
      const height = Math.ceil(Math.max(receipt.scrollHeight, receipt.getBoundingClientRect().height) * 25.4 / 96) + 2
      pageStyleRef.current.textContent = `@page { size: ${paper}mm ${height}mm; margin: 0; }`
    }
    updatePageSize()
    const observer = new ResizeObserver(updatePageSize)
    observer.observe(receipt)
    window.addEventListener('beforeprint', updatePageSize)
    return () => { observer.disconnect(); window.removeEventListener('beforeprint', updatePageSize) }
  }, [paper, order])
  const changePaper = (event) => {
    setPaper(event.target.value)
    localStorage.setItem('fp_receipt_paper', event.target.value)
  }

  return <>
    <label className="mb-2 flex items-center justify-between gap-3 text-sm font-semibold">Receipt paper
      <select className="field !w-auto" value={paper} onChange={changePaper}>
        <option value="58">58 mm</option><option value="80">80 mm</option>
      </select>
    </label>
    <p className="mb-4 text-xs text-slate-500">The PDF page fits this receipt automatically. For a thermal printer, choose matching paper, 100% scale, and turn off headers and footers.</p>
    <div className="rounded-xl border border-slate-200 bg-foam p-3">
      <div className="receipt-paper mx-auto max-w-full bg-white shadow-sm" style={{ width: `${paper}mm` }}><ReceiptContent order={order} /></div>
    </div>
    {createPortal(<div ref={printRef} id="print-receipt" aria-hidden="true" className="receipt-paper" style={{ width: `${paper}mm` }}><style ref={pageStyleRef} /><ReceiptContent order={order} /></div>, document.body)}
  </>
}
