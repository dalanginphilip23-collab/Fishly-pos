import { useState } from 'react'
import { photoUrl } from '../api'
import Icon from './Icon'

export default function ProductPhoto({ src, name, className = '' }) {
  const [failed, setFailed] = useState(null)
  return <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-sky text-wave ${className}`}>
    {src && failed !== src ? <img src={photoUrl(src)} alt={name} loading="lazy" className="h-full w-full object-cover" onError={() => setFailed(src)} /> : <Icon name="bag" className="!h-7 !w-7" />}
  </span>
}
