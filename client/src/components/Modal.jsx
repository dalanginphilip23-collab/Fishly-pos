import { useEffect, useRef } from 'react'

export default function Modal({ children, onClose, labelledBy, wide = false }) {
  const ref = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
     const previous = document.activeElement
     const previousOverflow = document.body.style.overflow
     document.body.style.overflow = 'hidden'
    const root = ref.current
    const focusable = () => [...root.querySelectorAll('button, input, textarea, select, [tabindex="0"]')].filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0)
    ;(root.querySelector('[autofocus]') || focusable()[0] || root).focus()
    const keydown = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeRef.current?.() }
      if (e.key === 'Tab') {
        const elements = focusable()
        const first = elements[0], last = elements.at(-1)
        if (!first) { e.preventDefault(); root.focus() }
        else if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { e.preventDefault(); first.focus() }
      }
    }
    root.addEventListener('keydown', keydown)
     return () => { document.body.style.overflow = previousOverflow; root.removeEventListener('keydown', keydown); previous?.focus() }
  }, [])
   return <div className="modal-overlay fixed inset-0 z-30 grid min-h-0 place-items-center overflow-hidden bg-ocean/60 backdrop-blur-sm"><div ref={ref} role="dialog" aria-modal="true" aria-labelledby={labelledBy} tabIndex={-1} className={`max-h-full min-w-0 w-full overflow-y-auto overscroll-contain rounded-2xl bg-white p-4 shadow-2xl sm:rounded-3xl sm:p-6 ${wide ? 'max-w-2xl' : 'max-w-md'}`}>{children}</div></div>
}
