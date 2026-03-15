import { useState } from 'react'
import { fmt, parseNum } from './useSheetData'
import s from './Views.module.css'

export default function ViewArticulos({ data }) {
  const { articulos } = data
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('precio-desc')
  const lista = articulos
    .filter(a=>{
      if(!search) return true
      const q=search.toLowerCase()
      return a['Artículo']?.toLowerCase().includes(q)||a['Proveedor']?.toLowerCase().includes(q)||a['Categoría']?.toLowerCase().includes(q)
    })
    .sort((a,b)=>{
      if(sortBy==='precio-desc') return parseNum(b['Último Precio Unit.'])-parseNum(a['Último Precio Unit.'])
      if(sortBy==='precio-asc') return parseNum(a['Último Precio Unit.'])-parseNum(b['Último Precio Unit.'])
      if(sortBy==='nombre') return (a['Artículo']||'').localeCompare(b['Artículo']||'')
      if(sortBy==='veces') return parseNum(b['Veces Visto'])-parseNum(a['Veces Visto'])
      return 0
    })
  const masComprado = [...articulos].sort((a,b)=>parseNum(b['Veces Visto'])-parseNum(a['Veces Visto']))[0]
  const masCaro = [...articulos].sort((a,b)=>parseNum(b['Último Precio Unit.'])-parseNum(a['Último Precio Unit.']))[0]
  return (
    <div>
      <div className={s.metrics}>
        <div className={s.metric}><div className={s.metricLabel}>Artículos</div><div className={s.metricValue}>{articulos.length}</div><div className={s.metricSub}>en catálogo</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Más comprado</div><div className={s.metricValue} style={{fontSize:13}}>{masComprado?.['Artículo']?.split(' ').slice(0,3).join(' ')||'—'}</div><div className={s.metricSub}>{masComprado?.['Veces Visto']} veces</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Más caro</div><div className={s.metricValue} style={{fontSize:13}}>{masCaro?.['Artículo']?.split(' ').slice(0,3).join(' ')||'—'}</div><div className={s.metricSub}>{masCaro?fmt(masCaro['Último Precio Unit.']):''}</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Proveedores</div><div className={s.metricValue}>{new Set(articulos.map(a=>a['Proveedor'])).size}</div><div className={s.metricSub}>con artículos</div></div>
      </div>
      <div className={s.card}>
        <div className={s.cardToolbar}>
          <div className={s.cardTitle} style={{marginBottom:0}}>Catálogo de artículos</div>
          <div style={{display:'flex',gap:8}}>
            <select className={s.searchInput} style={{width:180}} value={sortBy} onChange={e=>setSortBy(e.target.value)}>
              <option value="precio-desc">Mayor precio</option>
              <option value="precio-asc">Menor precio</option>
              <option value="nombre">Nombre A-Z</option>
              <option value="veces">Más comprado</option>
            </select>
            <input className={s.searchInput} placeholder="Buscar artículo, proveedor..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Artículo</th><th>Proveedor</th><th>Unidad</th><th>Último Precio Unit.</th><th>Última Fecha</th><th>Local</th><th>Categoría</th><th>Veces</th></tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={8} className={s.emptyRow}>No hay resultados</td></tr>}
              {lista.map((a,i)=>(
                <tr key={i}>
                  <td className={s.tdBold}>{a['Artículo']}</td>
                  <td className={s.tdMuted}>{a['Proveedor']}</td>
                  <td><span className={s.badge} style={{background:'#eff6ff',color:'#185fa5'}}>{a['Unidad']||'u'}</span></td>
                  <td className={s.tdBold}>{fmt(a['Último Precio Unit.'])}</td>
                  <td className={s.tdMuted}>{a['Última Fecha']}</td>
                  <td className={s.tdMuted} style={{fontSize:11}}>{a['Local']?.split(' - ')[1]||a['Local']}</td>
                  <td><span className={s.badge} style={{background:'#e6f1fb',color:'#185fa5'}}>{a['Categoría']?.replace(/[^\w\s/]/gu,'').trim()||'—'}</span></td>
                  <td style={{textAlign:'center'}}><span className={s.badge} style={{background:'#eaf3de',color:'#3b6d11'}}>{a['Veces Visto']||1}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
