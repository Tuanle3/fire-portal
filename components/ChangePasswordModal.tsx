'use client'
import { useState } from 'react'

async function sha256(msg: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export default function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPass, setOldPass]         = useState('')
  const [newPass, setNewPass]         = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [err, setErr]                 = useState('')
  const [ok, setOk]                   = useState(false)
  const [loading, setLoading]         = useState(false)

  async function submit() {
    setErr('')
    if (!oldPass || !newPass || !confirmPass) { setErr('Vui lòng điền đầy đủ thông tin'); return }
    if (newPass.length < 6)       { setErr('Mật khẩu mới phải có ít nhất 6 ký tự'); return }
    if (newPass !== confirmPass)  { setErr('Xác nhận mật khẩu mới không khớp'); return }
    setLoading(true)
    try {
      const [oldHash, newHash] = await Promise.all([sha256(oldPass), sha256(newPass)])
      const res  = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldHash, newHash }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.error || 'Đổi mật khẩu thất bại'); return }
      setOk(true)
    } catch {
      setErr('Lỗi kết nối, vui lòng thử lại')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <div className="so-backdrop" onClick={onClose} />
      <div className="ex-modal">
        <div className="so-header">
          <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--navy)' }}>Đổi mật khẩu</div>
          <button className="so-close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {err && <div className="so-err">{err}</div>}
          {ok ? (
            <div style={{ background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>
              ✓ Đổi mật khẩu thành công.
            </div>
          ) : (
            <>
              <div className="so-field so-field--full">
                <label className="so-label">Mật khẩu hiện tại</label>
                <input type="password" className="so-input" value={oldPass} onChange={e => setOldPass(e.target.value)} autoComplete="current-password" />
              </div>
              <div className="so-field so-field--full">
                <label className="so-label">Mật khẩu mới</label>
                <input type="password" className="so-input" value={newPass} onChange={e => setNewPass(e.target.value)} autoComplete="new-password" />
              </div>
              <div className="so-field so-field--full">
                <label className="so-label">Xác nhận mật khẩu mới</label>
                <input type="password" className="so-input" value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submit() }} autoComplete="new-password" />
              </div>
            </>
          )}
        </div>
        <div className="so-footer">
          <button className="so-cancel" style={{ marginLeft: 'auto' }} onClick={onClose}>{ok ? 'Đóng' : 'Hủy'}</button>
          {!ok && (
            <button className="so-save" onClick={submit} disabled={loading}>
              {loading ? 'Đang xử lý…' : 'Xác nhận'}
            </button>
          )}
        </div>
      </div>
    </>
  )
}
