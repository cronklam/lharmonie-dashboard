import { useState } from 'react'
import s from './Login.module.css'

const USERS = {
  martin:  { password: '0706',  nombre: 'Martín',  role: 'admin' },
  melanie: { password: '2607',  nombre: 'Melanie', role: 'admin' },
  iara:    { password: '3611',  nombre: 'Iara',    role: 'pagos' },
}

export default function Login({ onLogin }) {
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    const u = USERS[user.toLowerCase().trim()]
    if (u && u.password === pass) {
      onLogin({ usuario: user.toLowerCase().trim(), nombre: u.nombre, role: u.role })
    } else {
      setError('Usuario o contraseña incorrectos')
      setTimeout(() => setError(''), 2000)
    }
  }

  return (
    <div className={s.bg}>
      <div className={s.card}>
        <div className={s.logo}>L</div>
        <h1 className={s.title}>Lharmonie</h1>
        <p className={s.subtitle}>COMPRAS Y PAGOS</p>
        <div className={s.form}>
          <input
            className={s.input}
            placeholder="Usuario"
            value={user}
            onChange={e => setUser(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            autoCapitalize="none"
          />
          <input
            className={s.input}
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          {error && <p className={s.error}>{error}</p>}
          <button className={s.btn} onClick={handleLogin}>Ingresar</button>
        </div>
      </div>
    </div>
  )
}
