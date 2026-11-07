const paths = {
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  lock: 'M5 10h14v11H5z M8 10V7a4 4 0 0 1 8 0v3 M12 14v3',
  arrow: 'M4 12h16 M14 6l6 6-6 6',
  moon: 'M20.5 13A8.5 8.5 0 0 1 11 3.5 8.5 8.5 0 1 0 20.5 13z',
  sun: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1.5 1.5 M17.5 17.5L19 19 M5 19l1.5-1.5 M17.5 6.5L19 5',
  calendar: 'M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2',
  wallet: 'M3 6h17v15H3z M3 6V3h14v3 M15 11h6v5h-6z',
  refresh: 'M20 7v5h-5 M4 17v-5h5 M6 7a7 7 0 0 1 12-1l2 6 M4 12l2 6a7 7 0 0 0 12-1',
  register: 'M4 4h16v10H4z M7 8h4 M4 18h16v3H4z M8 14v4 M16 14v4',
  orders: 'M8 4H5v17h14V4h-3 M8 3h8v4H8z M8 12h8 M8 16h5',
  chart: 'M4 3v17h17 M8 16v-5 M13 16V7 M18 16V4',
  grid: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  logout: 'M9 4H4v16h5 M9 12h12 M17 8l4 4-4 4',
  bag: 'M5 7h14l1 14H4L5 7z M9 8V6a3 3 0 0 1 6 0v2',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12l4 4L19 6',
  admin: 'M12 3l8 3v6c0 4.8-3.4 7.6-8 9-4.6-1.4-8-4.2-8-9V6z M9 12l2 2 4-4',
  download: 'M12 3v12 M7 10l5 5 5-5 M4 21h16',
}

export default function Icon({ name, className = '' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={`h-5 w-5 shrink-0 ${className}`}><path d={paths[name] || paths.grid} /></svg>
}
