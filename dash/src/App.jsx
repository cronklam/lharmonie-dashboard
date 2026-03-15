import { useState } from 'react'
import { useSheetData } from './useSheetData'
import Login from './Login'
import ViewIara from './ViewIara'
import ViewMartin from './ViewMartin'
import ViewProveedores from './ViewProveedores'
import ViewArticulos from './ViewArticulos'
import s from './App.module.css'

export default function App() {
  const [sesion, setSesion] = useState(null)
  const [tab, setTab] = useState('iara')
  const sheetData = useSheetData()

  if (!sesion) return <Login onLogin={setSesion} />

  const esAdmin = sesion.role === 'admin'

  const tabs = [
    { id: 'iara', label: 'Pagos pendientes', icon: '💳' },
    ...(esAdmin ? [
      { id: 'martin', label: 'Análisis', icon: '📊' },
      { id: 'proveedores', label: 'Proveedores', icon: '🏢' },
      { id: 'articulos', label: 'Artículos', icon: '📦' },
    ] : [])
  ]

  return (
    <div className={s.app}>
      <header className={s.header}>
        <div className={s.headerLeft}>
          <div className={s.logo}><span className={s.logoText}>L</span></div>
          <div>
            <h1 className={s.title}>Lharmonie</h1>
            <p className={s.subtitle}>Compras y Pagos</p>
          </div>
        </div>
        <div className={s.headerRight}>
          <span className={s.userBadge}>👤 {sesion.nombre}</span>
          {sheetData.lastUpdate && <span className={s.lastUpdate}>Act. {sheetData.lastUpdate.toLocaleTimeString('es-AR', {hour:'2-digit',minute:'2-digit'})}</span>}
          <button className={s.refreshBtn} onClick={sheetData.reload} title="Actualizar">↻</button>
          <button className={s.logoutBtn} onClick={() => setSesion(null)} title="Cerrar sesión">✕</button>
        </div>
      </header>
      <nav className={s.nav}>
        {tabs.map(t => (
          <button key={t.id} className={`${s.navTab} ${tab===t.id?s.navTabActive:''}`} onClick={()=>setTab(t.id)}>
            <span>{t.icon}</span><span>{t.label}</span>
          </button>
        ))}
      </nav>
      <main className={s.main}>
        {sheetData.loading && <div className={s.loading}><div className={s.spinner}/><p>Cargando datos...</p></div>}
        {sheetData.error && <div className={s.error}><p>Error: {sheetData.error}</p></div>}
        {!sheetData.loading && !sheetData.error && (
          <>
            {tab==='iara' && <ViewIara data={sheetData}/>}
            {tab==='martin' && esAdmin && <ViewMartin data={sheetData}/>}
            {tab==='proveedores' && esAdmin && <ViewProveedores data={sheetData}/>}
            {tab==='articulos' && esAdmin && <ViewArticulos data={sheetData}/>}
          </>
        )}
      </main>
    </div>
  )
}
