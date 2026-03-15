import { useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { fmt, fmtK, parseNum } from './useSheetData'
import s from './Views.module.css'

const COLORS = ['#2563a8','#1d9e75','#c9a84c','#d85a30','#7f77dd','#d4537e','#378add','#639922']

export default function ViewMartin({ data }) {
  const { facturas } = data
  const [searchProv, setSearchProv] = useState('')
  const total = facturas.reduce((s,f)=>s+parseNum(f['Total']),0)
  const totalMP = facturas.filter(f=>f['Categoría']?.includes('Materia Prima')).reduce((s,f)=>s+parseNum(f['Total']),0)

  const byProv = {}
  facturas.forEach(f=>{ const p=f['Proveedor']||'Sin nombre'; byProv[p]=(byProv[p]||0)+parseNum(f['Total']) })
  const rankingProv = Object.entries(byProv).sort((a,b)=>b[1]-a[1])
  const topProv = rankingProv[0]
  const maxProv = rankingProv[0]?.[1]||1

  const byCat = {}
  facturas.forEach(f=>{ const c=f['Categoría']?.split('/')[0]?.replace(/[^\w\s]/gu,'').trim()||'Otro'; byCat[c]=(byCat[c]||0)+parseNum(f['Total']) })
  const dataCat = Object.entries(byCat).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value:Math.round(value)}))

  const byLocal = {}
  facturas.forEach(f=>{ const l=f['Local']?.split(' - ')[0]||'Sin local'; byLocal[l]=(byLocal[l]||0)+parseNum(f['Total']) })
  const dataLocal = Object.entries(byLocal).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name:name.replace('Lharmonie','Lh'),value:Math.round(value)}))

  const byMes = {}
  facturas.forEach(f=>{ const m=f['Mes']||'Sin fecha'; byMes[m]=(byMes[m]||0)+parseNum(f['Total']) })
  const dataMes = Object.entries(byMes).map(([name,value])=>({name,value:Math.round(value)}))

  const provFiltrados = rankingProv.filter(([p])=>p.toLowerCase().includes(searchProv.toLowerCase()))

  return (
    <div>
      <div className={s.metrics}>
        <div className={s.metric}><div className={s.metricLabel}>Total compras</div><div className={s.metricValue}>{fmtK(total)}</div><div className={s.metricSub}>{facturas.length} comprobantes</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Materia prima</div><div className={s.metricValue}>{total>0?Math.round(totalMP/total*100):0}%</div><div className={s.metricSub}>{fmtK(totalMP)}</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Mayor proveedor</div><div className={s.metricValue} style={{fontSize:14}}>{topProv?.[0]?.split(' ')[0]||'—'}</div><div className={s.metricSub}>{topProv?fmtK(topProv[1]):''}</div></div>
        <div className={s.metric}><div className={s.metricLabel}>Proveedores únicos</div><div className={s.metricValue}>{rankingProv.length}</div><div className={s.metricSub}>con facturas</div></div>
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <div className={s.cardTitle}>Ranking proveedores</div>
          <input className={s.searchInput} placeholder="Buscar..." value={searchProv} onChange={e=>setSearchProv(e.target.value)} style={{marginBottom:'1rem'}}/>
          <div className={s.rankingList}>
            {provFiltrados.slice(0,10).map(([prov,monto],i)=>(
              <div key={prov} className={s.rankRow}>
                <span className={s.rankNum}>{i+1}</span>
                <div className={s.rankInfo}>
                  <div className={s.rankName}>{prov}</div>
                  <div className={s.rankBar}><div className={s.rankBarFill} style={{width:`${Math.round(monto/maxProv*100)}%`}}/></div>
                </div>
                <span className={s.rankMonto}>{fmtK(monto)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={s.card}>
          <div className={s.cardTitle}>Por categoría</div>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={dataCat} cx="50%" cy="50%" innerRadius={60} outerRadius={90} dataKey="value" paddingAngle={2}>
                {dataCat.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>fmtK(v)}/>
              <Legend iconSize={10} iconType="square" formatter={v=><span style={{fontSize:11}}>{v}</span>}/>
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className={s.grid2}>
        <div className={s.card}>
          <div className={s.cardTitle}>Por local</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dataLocal} margin={{top:0,right:0,left:0,bottom:0}}>
              <XAxis dataKey="name" tick={{fontSize:11}}/>
              <YAxis tickFormatter={v=>'$'+Math.round(v/1000)+'K'} tick={{fontSize:11}} width={55}/>
              <Tooltip formatter={v=>fmtK(v)}/>
              <Bar dataKey="value" fill="#2563a8" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className={s.card}>
          <div className={s.cardTitle}>Por mes</div>
          {dataMes.length===0?<p className={s.empty}>Sin datos de mes</p>:
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dataMes} margin={{top:0,right:0,left:0,bottom:0}}>
              <XAxis dataKey="name" tick={{fontSize:11}}/>
              <YAxis tickFormatter={v=>'$'+Math.round(v/1000)+'K'} tick={{fontSize:11}} width={55}/>
              <Tooltip formatter={v=>fmtK(v)}/>
              <Bar dataKey="value" fill="#1d9e75" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>}
        </div>
      </div>
    </div>
  )
}
