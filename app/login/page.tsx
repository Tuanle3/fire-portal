'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [user, setUser] = useState('')
  const [pass, setPass] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  async function sha256(msg: string) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg))
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
  }

  async function doLogin() {
    if (!user || !pass) { setErr('Vui lòng nhập đầy đủ thông tin'); return }
    setErr('')
    setLoading(true)
    try {
      const hash = await sha256(pass)
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user, hash }),
      })
      if (res.ok) {
        router.push('/dashboard')
      } else {
        setErr('Tài khoản hoặc mật khẩu không đúng')
      }
    } catch {
      setErr('Lỗi kết nối. Vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') doLogin()
  }

  const features = [
    { icon: '◆', title: 'Dữ liệu Quy',  desc: 'Báo cáo theo quy — tổng hợp & phân tích' },
    { icon: '○', title: 'Tài sản',        desc: 'Quản lý tài sản & định giá theo kỳ' },
    { icon: '⬡', title: 'Realtime DB',   desc: 'Kết nối Firebase Realtime Database' },
    { icon: '◎', title: 'Phân quyền',    desc: 'Kiểm soát truy cập theo vai trò' },
  ]

  return (
    <>
      <style>{`
        .login-wrap { display:flex; min-height:100vh; background:#FAFAF8; font-family:'Be Vietnam Pro',sans-serif; }
        .login-left {
          flex:1; background:linear-gradient(145deg,#1C3557 0%,#162C47 60%,#0F1E31 100%);
          position:relative; display:flex; flex-direction:column; justify-content:space-between;
          padding:48px 52px; overflow:hidden; min-height:100vh;
        }
        .login-left::before { content:''; position:absolute; top:-80px; right:-80px; width:420px; height:420px; border-radius:50%; background:radial-gradient(circle,rgba(212,166,74,.12) 0%,transparent 70%); pointer-events:none; }
        .ll-circle { position:absolute; top:40px; right:40px; width:280px; height:280px; border-radius:50%; border:60px solid rgba(255,255,255,.05); pointer-events:none; }
        .ll-status { display:inline-flex; align-items:center; gap:7px; background:rgba(255,255,255,.08); border:1px solid rgba(255,255,255,.12); border-radius:20px; padding:5px 14px; font-size:11px; color:rgba(255,255,255,.75); letter-spacing:.05em; width:fit-content; }
        .ll-status-dot { width:7px; height:7px; border-radius:50%; background:#4ADE80; animation:pulse 2s infinite; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        .ll-h1 { font-family:'Be Vietnam Pro',sans-serif; font-size:36px; font-weight:700; color:#fff; line-height:1.2; margin-bottom:6px; margin-top:48px; }
        .ll-h2 { font-family:'Playfair Display',serif; font-size:36px; font-weight:700; font-style:italic; color:#D4A64A; line-height:1.2; margin-bottom:20px; }
        .ll-desc { color:rgba(255,255,255,.55); font-size:13px; line-height:1.7; max-width:340px; }
        .ll-features { display:flex; flex-direction:column; gap:12px; margin-top:48px; }
        .ll-feat { display:flex; align-items:center; gap:14px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.07); border-radius:12px; padding:14px 18px; }
        .ll-feat-ic { width:36px; height:36px; border-radius:9px; background:rgba(212,166,74,.15); display:flex; align-items:center; justify-content:center; color:#D4A64A; font-size:15px; flex-shrink:0; }
        .ll-feat-title { font-size:13px; font-weight:600; color:#fff; margin-bottom:2px; }
        .ll-feat-desc { font-size:11px; color:rgba(255,255,255,.45); }
        .ll-footer { color:rgba(255,255,255,.3); font-size:11px; margin-top:40px; }

        .login-right { width:420px; flex-shrink:0; display:flex; align-items:center; justify-content:center; padding:40px 32px; background:#fff; border-left:1px solid #EBEBEB; }
        .lp { width:100%; max-width:340px; }
        .lp-brand { display:flex; align-items:center; gap:10px; margin-bottom:36px; }
        .lp-logo { width:38px; height:38px; border-radius:10px; background:linear-gradient(135deg,#1C3557,#2D5280); display:flex; align-items:center; justify-content:center; color:#D4A64A; font-size:17px; font-weight:800; }
        .lp-brand-name { font-size:15px; font-weight:700; color:#1F2430; line-height:1.2; }
        .lp-brand-sub { font-size:10px; color:#9CA3AF; letter-spacing:.08em; }
        .lp-title { font-size:26px; font-weight:700; color:#1F2430; margin-bottom:6px; }
        .lp-sub { font-size:13px; color:#6B7280; margin-bottom:32px; }
        .lp-label { font-size:11px; font-weight:600; color:#3D3D3D; letter-spacing:.06em; margin-bottom:6px; }
        .lp-field { position:relative; margin-bottom:18px; }
        .lp-input { width:100%; height:46px; padding:0 42px 0 14px; border:1.5px solid #EBEBEB; border-radius:10px; font-size:13px; font-family:inherit; color:#1F2430; background:#FAFAF8; outline:none; transition:border-color .2s,box-shadow .2s; box-sizing:border-box; }
        .lp-input:focus { border-color:#1C3557; box-shadow:0 0 0 3px rgba(28,53,87,.08); background:#fff; }
        .lp-eye { position:absolute; right:12px; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#9CA3AF; font-size:14px; padding:4px; line-height:1; }
        .lp-err { background:#FDECEC; border:1px solid #FECACA; border-radius:8px; padding:10px 14px; font-size:12px; color:#8C1F1F; margin-bottom:16px; }
        .lp-btn { width:100%; height:46px; background:linear-gradient(135deg,#1C3557,#2D5280); color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:600; font-family:inherit; cursor:pointer; transition:opacity .2s,transform .1s; margin-top:4px; }
        .lp-btn:hover{opacity:.9} .lp-btn:active{transform:scale(.98)} .lp-btn:disabled{opacity:.6;cursor:not-allowed}
        .lp-note { text-align:center; margin-top:20px; font-size:11px; color:#9CA3AF; line-height:1.6; }
        @media(max-width:768px){ .login-left{display:none} .login-right{width:100%;border-left:none} }
      `}</style>

      <div className="login-wrap">
        <div className="login-left">
          <div className="ll-circle" />
          <div>
            <div className="ll-status">
              <div className="ll-status-dot" />
              HỆ THỐNG ĐANG HOẠT ĐỘNG
            </div>
            <div className="ll-h1">Quản trị dữ liệu</div>
            <div className="ll-h2">Fire Portal</div>
            <p className="ll-desc">
              Nền tảng quản lý dữ liệu tập trung trên Firebase –<br />
              bảo mật, thời gian thực, phân quyền linh hoạt.
            </p>
            <div className="ll-features">
              {features.map(f => (
                <div key={f.title} className="ll-feat">
                  <div className="ll-feat-ic">{f.icon}</div>
                  <div>
                    <div className="ll-feat-title">{f.title}</div>
                    <div className="ll-feat-desc">{f.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="ll-footer">Fire Portal © 2026</div>
        </div>

        <div className="login-right">
          <div className="lp">
            <div className="lp-brand">
              <div className="lp-logo">F</div>
              <div>
                <div className="lp-brand-name">Fire Portal</div>
                <div className="lp-brand-sub">MANAGEMENT SYSTEM</div>
              </div>
            </div>

            <div className="lp-title">Đăng nhập</div>
            <div className="lp-sub">Nhập thông tin tài khoản để tiếp tục</div>

            <div className="lp-label">TÀI KHOẢN</div>
            <div className="lp-field">
              <input
                className="lp-input" type="text" placeholder="admin"
                value={user} onChange={e => setUser(e.target.value)}
                onKeyDown={handleKey} autoComplete="username"
              />
            </div>

            <div className="lp-label">MẬT KHẨU</div>
            <div className="lp-field">
              <input
                className="lp-input" type={showPass ? 'text' : 'password'} placeholder="••••••••"
                value={pass} onChange={e => setPass(e.target.value)}
                onKeyDown={handleKey} autoComplete="current-password"
              />
              <button type="button" className="lp-eye" onClick={() => setShowPass(v => !v)} tabIndex={-1}>
                {showPass ? '🙈' : '👁'}
              </button>
            </div>

            {err && <div className="lp-err">⚠ {err}</div>}

            <button className="lp-btn" onClick={doLogin} disabled={loading}>
              {loading ? 'Đang xác thực...' : 'Đăng nhập'}
            </button>

            <div className="lp-note">
              Chỉ dành cho thành viên được cấp quyền.
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
