import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || ''
const API_SECRET = import.meta.env.VITE_API_SECRET || 'lharmonie2026'
import { fmt, fmtK, parseNum } from './useSheetData'
import s from './Views.module.css'

export default function ViewIara({ data }) {
  const { facturas } = data
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState('pendientes')

  const esPagada = f => {
    const estado = (f['Estado'] || '').toLowerCase()
    const medioPago = (f['Medio de Pago'] || '').toLowerCase()
    return estado.includes('pagado') || medioPago.includes('pagado')
  }
  const [marcando, setMarcando] = useState(null)

  const marcarPagado = async (f) => {
    const key = f['# Factura'] || f['Comprobante']
    setMarcando(key)
    try {
      const res = await fetch(`${API_URL}/marcar-pagado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${API_SECRET}` },
        body: JSON.stringify({
          proveedor: f['Proveedor'],
          numero_factura: f['# Factura'],
          fecha_pago: new Date().toLocaleDateString('es-AR', {day:'2-digit',month:'2-digit',year:'numeric'})
        })
      })
      const data = await res.json()
      if (data.ok) {
        alert(`✅ ${f['Proveedor']} marcado como Pagado`)
      } else {
        alert(`❌ Error: ${data.message}`)
      }
    } catch(e) {
      alert('❌ No se pudo conectar con el servidor')
    }
    setMarcando(null)
  }

  const pending = facturas.filter(f => !esPagada(f))
  const paid = facturas.filter(f => esPagada(f))
  const totalPendiente = pending.reduce((s,f)=>s+parseNum(f['Total']),0)
  const totalPagado = paid.reduce((s,f)=>s+parseNum(f['Total']),0)
  const provUnicos = new Set(facturas.map(f=>f['Proveedor'])).size

  const lista = (filtro==='pendientes'?pending:filtro==='pagadas'?paid:facturas).filter(f=>{
    if(!search) return true
    const q=search.toLowerCase()
    return f['Proveedor']?.toLowerCase().includes(q)||f['# Factura']?.toLowerCase().includes(q)||f['Categoría']?.toLowerCase().includes(q)||f['Local']?.toLowerCase().includes(q)||f['Alias / CBU']?.toLowerCase().includes(q)
  })

  return (
    <div>
      <div className={s.metrics}>
        <div className={s.metric}><div className={s.metricLabel}>Total pendiente</div><div className={`${s.metricValue} ${s.danger}`}>{fmtK(totalPendiente)}</div><div className={s.metricSub}>{pending.length} facturas</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Pagado este mes</div><div className={`${s.metricValue} ${s.success}`}>{fmtK(totalPagado)}</div><div className={s.metricSub}>{paid.length} facturas</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Proveedores activos</div><div className={s.metricValue}>{provUnicos}</div><div className={s.metricSub}>con compras</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Total compras</div><div className={s.metricValue}>{fmtK(totalPendiente+totalPagado)}</div><div className={s.metricSub}>{facturas.length} comprobantes</div></div>
      </div>
      <div className={s.card}>
        <div className={s.cardToolbar}>
          <div className={s.filterTabs}>
            {[{id:'pendientes',label:`Pendientes (${pending.length})`},{id:'pagadas',label:`Pagadas (${paid.length})`},{id:'todas',label:`Todas (${facturas.length})`}].map(t=>(
              <button key={t.id} className={`${s.filterTab} ${filtro===t.id?s.filterTabActive:''}`} onClick={()=>setFiltro(t.id)}>{t.label}</button>
            ))}
          </div>
          <input className={s.searchInput} placeholder="Buscar proveedor, factura, local..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Proveedor</th><th>Comprobante</th><th>Fecha</th><th>Local</th><th>Categoría</th><th>Neto</th><th>IVA 21%</th><th>Total</th><th>Alias / CBU</th><th>Estado</th></tr></thead>
            <tbody>
              {lista.length===0 && <tr><td colSpan={10} className={s.emptyRow}>No hay resultados</td></tr>}
              {lista.map((f,i)=>{
                const pagada = esPagada(f)
                return (
                  <tr key={i} className={pagada?s.rowPaid:''}>
                    <td className={s.tdBold}>{f['Proveedor']}</td>
                    <td className={s.tdMono}>{f['# PV']?`${f['# PV']}-${f['# Factura']}`:f['# Factura']}</td>
                    <td className={s.tdMuted}>{f['Fecha FC']}</td>
                    <td className={s.tdMuted} style={{fontSize:11}}>{f['Local']?.split(' - ')[1]||f['Local']}</td>
                    <td><span className={s.badge} style={{background:'#e6f1fb',color:'#185fa5'}}>{f['Categoría']?.split('/')[0]?.replace(/[^\w\s/]/gu,'').trim()}</span></td>
                    <td>{fmt(f['Importe Neto'])}</td>
                    <td className={s.tdMuted}>{fmt(f['IVA 21%'])}</td>
                    <td className={s.tdBold}>{fmt(f['Total'])}</td>
                    <td>{f['Alias / CBU']?<span className={s.alias}>{f['Alias / CBU']}</span>:<span className={s.aliasPending}>Sin alias</span>}</td>
                    <td>
                      <span className={`${s.badge} ${pagada?s.badgeSuccess:s.badgeDanger}`}>{pagada?'Pagado':'Pendiente'}</span>
                      {!pagada && (
                        <button
                          className={s.btnPagar}
                          onClick={() => marcarPagado(f)}
                          disabled={marcando === (f['# Factura'] || f['Comprobante'])}
                        >
                          {marcando === (f['# Factura'] || f['Comprobante']) ? '...' : 'Marcar pagado'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
