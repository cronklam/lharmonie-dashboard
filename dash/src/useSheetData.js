import { useState, useEffect } from 'react'

const SHEETS_ID = import.meta.env.VITE_SHEETS_ID
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

function parseSheet(values, skip = 2) {
  if (!values || values.length <= skip) return []
  const headers = values[skip - 1]
  return values.slice(skip).filter(r => r.some(c => c)).map(row => {
    const obj = {}
    headers.forEach((h, i) => { obj[h] = row[i] || '' })
    return obj
  })
}

async function fetchSheet(name) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_ID}/values/${encodeURIComponent(name)}?key=${API_KEY}`
  const res = await fetch(url)
  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.values || []
}

export function useSheetData() {
  const [data, setData] = useState({ facturas: [], articulos: [], proveedores: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)

  const load = async () => {
    try {
      setLoading(true)
      const [fv, av, pv] = await Promise.all([
        fetchSheet('Facturas'), fetchSheet('Artículos'), fetchSheet('Proveedores')
      ])
      setData({ facturas: parseSheet(fv, 2), articulos: parseSheet(av, 2), proveedores: parseSheet(pv, 2) })
      setLastUpdate(new Date())
      setError(null)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t) }, [])
  return { ...data, loading, error, lastUpdate, reload: load }
}

export function parseNum(str) {
  if (!str) return 0
  return parseFloat(String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0
}

export function fmt(n) { return '$' + Math.round(parseNum(n)).toLocaleString('es-AR') }
export function fmtK(n) {
  const v = Math.round(parseNum(n))
  if (v >= 1000000) return '$' + (v/1000000).toFixed(1) + 'M'
  if (v >= 1000) return '$' + Math.round(v/1000) + 'K'
  return '$' + v
}
