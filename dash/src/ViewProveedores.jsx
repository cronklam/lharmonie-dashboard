import { useState } from 'react'
import { fmt, parseNum } from './useSheetData'
import s from './Views.module.css'

export default function ViewProveedores({ data }) {
  const { proveedores } = data
  const [search, setSearch] = useState('')
  const sinAlias = proveedores.filter(p=>!p['Alias / CBU']).length
  const lista = proveedores.filter(p=>{
    if(!search) return true
    const q=search.toLowerCase()
    return p['Razón Social']?.toLowerCase().includes(q)||p['CUIT']?.includes(q)||p['Alias / CBU']?.toLowerCase().includes(q)||p['Categoría']?.toLowerCase().includes(q)
  })
  return (
    <div>
      <div className={s.metrics}>
        <div className={s.metric}><div className={s.metricLabel}>Proveedores</div><div className={s.metricValue}>{proveedores.length}</div><div className={s.metricSub}>registrados</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Sin alias</div><div className={`${s.metricValue} ${sinAlias>0?s.warning:s.success}`}>{sinAlias}</div><div className={s.metricSub}>pendiente completar</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Con email</div><div className={s.metricValue}>{proveedores.filter(p=>p['Email']).length}</div><div className={s.metricSub}>de {proveedores.length}</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Con teléfono</div><div className={s.metricValue}>{proveedores.filter(p=>p['Teléfono']).length}</div><div className={s.metricSub}>de {proveedores.length}</div></div>
      </div>
      {sinAlias>0&&<div className={s.alertBanner}><strong>{sinAlias} proveedor{sinAlias>1?'es':''} sin alias</strong> — completá los alias en el Google Sheet para facilitar los pagos.</div>}
      <div className={s.card}>
        <div className={s.cardToolbar}>
          <div className={s.cardTitle} style={{marginBottom:0}}>Directorio de proveedores</div>
          <input className={s.searchInput} placeholder="Buscar nombre, CUIT, alias..." value={search} onChange={e=>setSearch(e.target.value)}/>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Razón Social</th><th>CUIT</th><th>Alias / CBU</th><th>Banco</th><th>Categoría</th><th>Condición Pago</th><th>Teléfono</th><th>Email</th><th>Última Compra</th><th>Total Comprado</th></tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={10} className={s.emptyRow}>No hay resultados</td></tr>}
              {lista.map((p,i)=>(
                <tr key={i}>
                  <td className={s.tdBold}>{p['Razón Social']}</td>
                  <td className={s.tdMono}>{p['CUIT']||'—'}</td>
                  <td>{p['Alias / CBU']?<span className={s.alias}>{p['Alias / CBU']}</span>:<span className={s.aliasPending}>Sin alias</span>}</td>
                  <td className={s.tdMuted}>{p['Banco']||'—'}</td>
                  <td><span className={s.badge} style={{background:'#e6f1fb',color:'#185fa5'}}>{p['Categoría']?.replace(/[^\w\s/]/gu,'').trim()||'—'}</span></td>
                  <td className={s.tdMuted}>{p['Condición de Pago']||'—'}</td>
                  <td className={s.tdMuted}>{p['Teléfono']||'—'}</td>
                  <td className={s.tdMuted} style={{fontSize:11}}>{p['Email']||'—'}</td>
                  <td className={s.tdMuted}>{p['Última Compra']||'—'}</td>
                  <td className={s.tdBold}>{p['Total Comprado']?fmt(p['Total Comprado']):'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
