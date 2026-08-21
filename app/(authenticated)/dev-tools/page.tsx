// ============================================================
// DEV TOOLS — Trang tạm, chỉ dùng để chạy các thao tác 1-lần
// (migration dữ liệu cũ...). KHÔNG có trong menu điều hướng,
// vào thẳng bằng URL: /dev-tools
//
// Sau khi chạy xong migration mã ngân sách (đại ca xác nhận
// đã chạy), có thể xoá thư mục app/(authenticated)/dev-tools/
// hoặc để lại phòng khi cần chạy migration khác sau này.
// ============================================================
'use client'

import { useState } from 'react'
import { migrateMaNganSachDaiHan } from '@/lib/han-muc-store'
import { migrateMaNganSachNganHan } from '@/lib/han-muc-ngan-han-store'

type KetQua = { updated: number; skipped: number; warn?: number } | null

export default function DevToolsPage() {
  const [runningDaiHan, setRunningDaiHan] = useState(false)
  const [runningNganHan, setRunningNganHan] = useState(false)
  const [ketQuaDaiHan, setKetQuaDaiHan] = useState<KetQua>(null)
  const [ketQuaNganHan, setKetQuaNganHan] = useState<KetQua>(null)
  const [errDaiHan, setErrDaiHan] = useState('')
  const [errNganHan, setErrNganHan] = useState('')

  async function chayDaiHan() {
    if (!confirm('Chạy migration mã ngân sách cho HỢP ĐỒNG DÀI HẠN? Thao tác này ghi trực tiếp vào Firestore, nên chỉ chạy 1 lần.')) return
    setRunningDaiHan(true); setErrDaiHan(''); setKetQuaDaiHan(null)
    try {
      const r = await migrateMaNganSachDaiHan()
      setKetQuaDaiHan(r)
    } catch (e: any) {
      setErrDaiHan(e?.message ?? String(e))
    } finally {
      setRunningDaiHan(false)
    }
  }

  async function chayNganHan() {
    if (!confirm('Chạy migration mã ngân sách cho HẠN MỨC NGẮN HẠN? Thao tác này ghi trực tiếp vào Firestore, nên chỉ chạy 1 lần.')) return
    setRunningNganHan(true); setErrNganHan(''); setKetQuaNganHan(null)
    try {
      const r = await migrateMaNganSachNganHan()
      setKetQuaNganHan(r)
    } catch (e: any) {
      setErrNganHan(e?.message ?? String(e))
    } finally {
      setRunningNganHan(false)
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--nh-navy)', marginBottom: 4 }}>
        🛠️ Dev Tools — Migration mã ngân sách
      </h1>
      <p style={{ fontSize: 13, color: 'var(--nh-muted2)', marginBottom: 24 }}>
        Trang tạm, chạy 1 lần cho hợp đồng/hạn mức cũ chưa có mã ngân sách. Sau khi chạy xong
        và xác nhận dữ liệu đúng, có thể bỏ qua trang này.
      </p>

      {/* ── DÀI HẠN ── */}
      <div className="nh-card" style={{ marginBottom: 16 }}>
        <div className="nh-card-head">
          <span className="nh-card-title">Hợp đồng tín dụng dài hạn</span>
        </div>
        <div className="nh-card-body">
          <button className="btn-primary" onClick={chayDaiHan} disabled={runningDaiHan}>
            {runningDaiHan ? 'Đang chạy…' : 'Chạy migrateMaNganSachDaiHan()'}
          </button>
          {ketQuaDaiHan && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#166534' }}>
              ✅ Đã cập nhật: <b>{ketQuaDaiHan.updated}</b> hợp đồng
              &nbsp;|&nbsp; Bỏ qua (đã có mã): <b>{ketQuaDaiHan.skipped}</b>
              {ketQuaDaiHan.warn != null && <>&nbsp;|&nbsp; Cảnh báo (thiếu dữ liệu để sinh mã): <b>{ketQuaDaiHan.warn}</b></>}
            </div>
          )}
          {errDaiHan && <p className="nh-err" style={{ marginTop: 12 }}>{errDaiHan}</p>}
        </div>
      </div>

      {/* ── NGẮN HẠN ── */}
      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Hạn mức khung ngắn hạn</span>
        </div>
        <div className="nh-card-body">
          <button className="btn-primary" onClick={chayNganHan} disabled={runningNganHan}>
            {runningNganHan ? 'Đang chạy…' : 'Chạy migrateMaNganSachNganHan()'}
          </button>
          {ketQuaNganHan && (
            <div style={{ marginTop: 12, fontSize: 13, color: '#166534' }}>
              ✅ Đã cập nhật: <b>{ketQuaNganHan.updated}</b> khung
              &nbsp;|&nbsp; Bỏ qua (đã có mã): <b>{ketQuaNganHan.skipped}</b>
            </div>
          )}
          {errNganHan && <p className="nh-err" style={{ marginTop: 12 }}>{errNganHan}</p>}
        </div>
      </div>
    </div>
  )
}
