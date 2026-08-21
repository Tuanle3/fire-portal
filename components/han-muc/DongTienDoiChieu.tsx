// ============================================================
// PHẦN 5 — ĐỐI CHIẾU: so khớp lịch trả nợ/thu (Hạn mức tín dụng)
// với dòng thực tế trên Sheet (data_quy), gọi doiChieuTatCa() từ
// dong-tien-doi-chieu-engine.ts, có nút "Đồng bộ" để ghi nhận
// thực tế thẳng vào lịch trả nợ/thu.
//
// GỘP THEO KỲ: engine trả DoiChieuRow riêng lẻ cho từng loaiKhoan
// ('lai' | 'goc') của CÙNG 1 kỳ (VD kỳ 5 có 1 dòng lãi + 1 dòng
// gốc) — vì markKyDaTraThucTe()/markKyThuDaThu() cần GHI CẢ GỐC
// LẪN LÃI CỦA 1 KỲ TRONG 1 LẦN GỌI, nên component này gộp lại
// theo `kyRef` trước khi hiển thị + trước khi Đồng bộ.
//
// 3 nhóm hiển thị tách biệt (đúng ý nghĩa khác nhau — xem log):
//   1. Kỳ trả nợ/thu (đã gộp lãi+gốc) — có thể Đồng bộ
//   2. Giải ngân/đáo hạn ngắn hạn phát sinh trên Sheet (mã Thu,
//      chưa khớp được bộ hồ sơ cụ thể — chỉ liệt kê, không đồng bộ)
//   3a. Dòng dư thừa trên Sheet (HĐ thật nhưng trả sớm/ngoài lịch)
//   3b. Mã lịch sử tự do (NV_/Ngoai_/TTD_) — cần đại ca soát tay
//       riêng, KHÔNG tự động khớp được
//
// Dùng đúng bộ class CSS hệ thống fire-portal — không Tailwind.
// ============================================================
'use client'

import { useEffect, useMemo, useState } from 'react'
import { subscribeDoiChieuNguonData, DoiChieuNguonData } from '@/lib/dong-tien-doi-chieu-adapter'
import { subscribeDongTienTuQuy, DongTienQuyData } from '@/lib/dong-tien-quy-adapter'
import { doiChieuTatCa, DoiChieuRow } from '@/lib/dong-tien-doi-chieu-engine'
import { markKyDaTraThucTe } from '@/lib/han-muc-store'
import { markKyThuDaThu } from '@/lib/han-muc-ngan-han-store'
import type { EntityType } from '@/lib/han-muc-types'

interface Props {
  entity: EntityType | 'all'
}

const VND = new Intl.NumberFormat('vi-VN')

// ── Kỳ đã gộp lãi + gốc (dùng để hiển thị 1 dòng + Đồng bộ 1 lần) ──
interface KyGop {
  key:            string
  kyHan:          'ngan-han' | 'dai-han'
  entity:         string
  nganHang:       string
  hopDongLabel:   string
  ngayKeHoach:    string
  laiKH:          number
  gocKH:          number
  laiTT?:         number
  gocTT?:         number
  ngayTT?:        string
  trangThai:      'khop' | 'lech' | 'thieu-du-lieu'
  kyRef:          DoiChieuRow['kyRef']
}

function gomTheoKy(rows: DoiChieuRow[]): KyGop[] {
  const map = new Map<string, KyGop>()

  rows
    .filter(r => r.loaiKhoan === 'lai' || r.loaiKhoan === 'goc')
    .filter(r => r.trangThai !== 'sheet-du-thua' && r.trangThai !== 'khong-xac-dinh')
    .forEach(r => {
      const key = `${r.kyHan}-${r.kyRef.kyId}-${r.kyRef.hopDongId ?? ''}-${r.kyRef.boHoSoId ?? ''}`
      if (!map.has(key)) {
        map.set(key, {
          key, kyHan: r.kyHan, entity: r.entity, nganHang: r.nganHang,
          hopDongLabel: r.hopDongLabel, ngayKeHoach: r.ngayKeHoach,
          laiKH: 0, gocKH: 0, trangThai: 'khop', kyRef: r.kyRef,
        })
      }
      const g = map.get(key)!
      if (r.loaiKhoan === 'lai') { g.laiKH = r.soTienKeHoach; g.laiTT = r.soTienThucTe }
      if (r.loaiKhoan === 'goc') { g.gocKH = r.soTienKeHoach; g.gocTT = r.soTienThucTe }
      if (r.ngayThucTe) g.ngayTT = r.ngayThucTe
      // trạng thái cả kỳ = tệ nhất trong các dòng con: thiếu > lệch > khớp
      const rang: Record<string, number> = { 'khop': 0, 'lech': 1, 'chua-co-du-lieu-sheet': 2 }
      const rTrang = rang[r.trangThai] ?? 2
      const gTrang = rang[g.trangThai === 'thieu-du-lieu' ? 'chua-co-du-lieu-sheet' : g.trangThai] ?? 0
      if (rTrang > gTrang) g.trangThai = r.trangThai === 'chua-co-du-lieu-sheet' ? 'thieu-du-lieu' : (r.trangThai as any)
    })

  return Array.from(map.values()).sort((a, b) => a.ngayKeHoach.localeCompare(b.ngayKeHoach))
}

function badgeTrangThai(t: KyGop['trangThai']) {
  if (t === 'khop')  return <span className="nh-badge nh-b-green">Khớp</span>
  if (t === 'lech')  return <span className="nh-badge nh-b-red">Lệch</span>
  return <span className="nh-badge nh-b-grey">Chưa có trên Sheet</span>
}

export default function DongTienDoiChieu({ entity }: Props) {
  const [nguonData, setNguonData] = useState<DoiChieuNguonData>({
    hopDongMap: new Map(), kyTraNoList: [], khungMap: new Map(),
    boHoSoMap: new Map(), kyThuList: [], dangTai: true,
  })
  const [quyData, setQuyData] = useState<DongTienQuyData>({
    hoatDong: [], vayRows: [], khongXacDinh: [], tonQuyRealtime: 0,
  })
  const [moRong,     setMoRong]     = useState(false)
  const [moDuThua,   setMoDuThua]   = useState(false)
  const [syncingKey, setSyncingKey] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeDoiChieuNguonData(setNguonData, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  useEffect(() => {
    const unsub = subscribeDongTienTuQuy(setQuyData, entity === 'all' ? undefined : entity)
    return () => unsub()
  }, [entity])

  const doiChieuRows = useMemo(() => doiChieuTatCa({
    kyTraNoList: nguonData.kyTraNoList,
    hopDongMap:  nguonData.hopDongMap,
    kyThuList:   nguonData.kyThuList,
    boHoSoMap:   nguonData.boHoSoMap,
    khungMap:    nguonData.khungMap,
    vayRows:     quyData.vayRows,
  }), [nguonData, quyData.vayRows])

  const kyGopList     = useMemo(() => gomTheoKy(doiChieuRows), [doiChieuRows])
  const thuGiaiNganRows = useMemo(() => doiChieuRows.filter(r => r.loaiKhoan === 'thu-giai-ngan'), [doiChieuRows])
  const duThuaRows       = useMemo(() => doiChieuRows.filter(r => r.trangThai === 'sheet-du-thua'), [doiChieuRows])
  const khongXacDinhRows = useMemo(() => doiChieuRows.filter(r => r.trangThai === 'khong-xac-dinh'), [doiChieuRows])

  const soLech  = kyGopList.filter(g => g.trangThai === 'lech').length
  const soKhop  = kyGopList.filter(g => g.trangThai === 'khop').length
  const soThieu = kyGopList.filter(g => g.trangThai === 'thieu-du-lieu').length

  async function handleDongBo(g: KyGop) {
    const ngay = g.ngayTT || g.ngayKeHoach
    const goc  = g.gocTT ?? g.gocKH
    const lai  = g.laiTT ?? g.laiKH
    const ok = window.confirm(
      `Đồng bộ ${g.hopDongLabel}?\nNgày thực tế: ${ngay}\nGốc: ${VND.format(goc)}  Lãi: ${VND.format(lai)}`,
    )
    if (!ok) return

    setSyncingKey(g.key)
    try {
      if (g.kyHan === 'dai-han') {
        const hopDong    = g.kyRef.hopDongId ? nguonData.hopDongMap.get(g.kyRef.hopDongId) : undefined
        const kyHienTai   = nguonData.kyTraNoList.find(k => k.id === g.kyRef.kyId)
        if (!hopDong || !kyHienTai) throw new Error('Không tìm thấy hợp đồng hoặc kỳ trả nợ tương ứng.')
        const allKy = nguonData.kyTraNoList.filter(k => k.hopDongId === hopDong.id)
        await markKyDaTraThucTe(hopDong, kyHienTai, allKy, ngay, goc, lai)
      } else {
        if (!g.kyRef.hanMucId || !g.kyRef.boHoSoId) throw new Error('Thiếu tham chiếu hạn mức/bộ hồ sơ.')
        await markKyThuDaThu(g.kyRef.hanMucId, g.kyRef.boHoSoId, g.kyRef.kyId, ngay, goc, lai)
      }
    } catch (e: any) {
      alert('Lỗi đồng bộ: ' + (e?.message ?? String(e)))
    } finally {
      setSyncingKey(null)
    }
  }

  const dangTai = nguonData.dangTai

  return (
    <div className="nh-card" style={{ marginTop: 14 }}>
      <div
        className="nh-card-head"
        onClick={() => setMoRong(v => !v)}
        style={{ cursor: 'pointer', userSelect: 'none', flexWrap: 'wrap', gap: 8 }}
      >
        <span className="nh-card-title">
          {moRong ? '▲' : '▶'} Đối chiếu Sheet (data_quy)
          {soLech > 0 && <span className="nh-badge nh-b-red" style={{ marginLeft: 8 }}>{soLech} lệch</span>}
          {soKhop > 0 && <span className="nh-badge nh-b-green" style={{ marginLeft: 6 }}>{soKhop} khớp</span>}
          {soThieu > 0 && <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>{soThieu} chưa có Sheet</span>}
        </span>
        <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>
          {dangTai ? 'Đang tải...' : (moRong ? 'Thu gọn' : 'Mở rộng')}
        </span>
      </div>

      {moRong && (
        <div className="nh-card-body" style={{ padding: 0 }}>

          {/* ── BẢNG 1: KỲ TRẢ NỢ / THU — có thể Đồng bộ ── */}
          <table className="nh-tbl">
            <thead>
              <tr>
                <th>Ngày KH</th>
                <th>Pháp nhân</th>
                <th>Ngân hàng</th>
                <th>Hợp đồng / kỳ</th>
                <th className="r">Lãi (KH → TT)</th>
                <th className="r">Gốc (KH → TT)</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {kyGopList.map(g => (
                <tr key={g.key}>
                  <td>{g.ngayKeHoach}{g.ngayTT && g.ngayTT !== g.ngayKeHoach && (
                    <div style={{ fontSize: 11, color: 'var(--nh-muted2)' }}>TT: {g.ngayTT}</div>
                  )}</td>
                  <td>{g.entity}</td>
                  <td>{g.nganHang}</td>
                  <td>
                    {g.hopDongLabel}
                    <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>
                      {g.kyHan === 'dai-han' ? 'Dài hạn' : 'Ngắn hạn'}
                    </span>
                  </td>
                  <td className="r">
                    {VND.format(g.laiKH)}
                    {g.laiTT != null && g.laiTT !== g.laiKH && (
                      <div style={{ fontSize: 11, color: g.laiTT > g.laiKH ? 'var(--nh-red)' : 'var(--nh-green)' }}>
                        → {VND.format(g.laiTT)}
                      </div>
                    )}
                  </td>
                  <td className="r">
                    {VND.format(g.gocKH)}
                    {g.gocTT != null && g.gocTT !== g.gocKH && (
                      <div style={{ fontSize: 11, color: g.gocTT > g.gocKH ? 'var(--nh-red)' : 'var(--nh-green)' }}>
                        → {VND.format(g.gocTT)}
                      </div>
                    )}
                  </td>
                  <td>{badgeTrangThai(g.trangThai)}</td>
                  <td>
                    {g.trangThai !== 'thieu-du-lieu' ? (
                      <button
                        className="btn-primary"
                        disabled={syncingKey === g.key}
                        onClick={() => handleDongBo(g)}
                        style={{ padding: '4px 10px', fontSize: 12 }}
                      >
                        {syncingKey === g.key ? 'Đang đồng bộ...' : 'Đồng bộ'}
                      </button>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--nh-muted2)' }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
              {kyGopList.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', color: 'var(--nh-muted2)', padding: 24 }}>
                    {dangTai ? 'Đang tải dữ liệu...' : 'Không có kỳ nào cần đối chiếu.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* ── BẢNG 2: MÃ THU (giải ngân/đáo hạn ngắn hạn) — chỉ liệt kê ── */}
          {thuGiaiNganRows.length > 0 && (
            <div style={{ padding: '14px 20px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)', marginBottom: 8 }}>
                ⚠ Phát sinh mã Thu ngắn hạn trên Sheet (chưa khớp được bộ hồ sơ cụ thể)
              </div>
              <table className="nh-tbl">
                <thead>
                  <tr><th>Ngày</th><th>Pháp nhân</th><th>Ngân hàng</th><th>Khung hạn mức</th><th className="r">Số tiền</th></tr>
                </thead>
                <tbody>
                  {thuGiaiNganRows.map(r => (
                    <tr key={r.key}>
                      <td>{r.ngayThucTe}</td>
                      <td>{r.entity}</td>
                      <td>{r.nganHang}</td>
                      <td>{r.hopDongLabel}</td>
                      <td className="r">{VND.format(r.soTienThucTe ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── BẢNG 3: DƯ THỪA / KHÔNG XÁC ĐỊNH — thu gọn, tách 2 nhóm riêng ── */}
          {(duThuaRows.length > 0 || khongXacDinhRows.length > 0) && (
            <div style={{ borderTop: '1px solid var(--nh-border)' }}>
              <div
                onClick={() => setMoDuThua(v => !v)}
                style={{ padding: '10px 20px', cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--nh-navy)' }}
              >
                {moDuThua ? '▲' : '▶'} Dòng Sheet chưa khớp được kỳ nào
                {duThuaRows.length > 0 && <span className="nh-badge nh-b-amber" style={{ marginLeft: 8 }}>{duThuaRows.length} dư thừa</span>}
                {khongXacDinhRows.length > 0 && <span className="nh-badge nh-b-grey" style={{ marginLeft: 6 }}>{khongXacDinhRows.length} mã lịch sử tự do</span>}
              </div>

              {moDuThua && (
                <div style={{ padding: '0 20px 16px' }}>
                  {duThuaRows.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: '4px 0 6px' }}>
                        Có HĐ khớp mã nhưng không rõ đúng kỳ nào — có thể trả sớm/ngoài lịch, đại ca đối chiếu tay:
                      </div>
                      <table className="nh-tbl">
                        <thead>
                          <tr><th>Ngày</th><th>Pháp nhân</th><th>Ngân hàng</th><th>Loại</th><th className="r">Số tiền</th></tr>
                        </thead>
                        <tbody>
                          {duThuaRows.map(r => (
                            <tr key={r.key}>
                              <td>{r.ngayThucTe}</td>
                              <td>{r.entity}</td>
                              <td>{r.nganHang}</td>
                              <td>{r.loaiKhoan === 'lai' ? 'Lãi' : r.loaiKhoan === 'goc' ? 'Gốc' : 'Thu giải ngân'}</td>
                              <td className="r">{VND.format(r.soTienThucTe ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  {khongXacDinhRows.length > 0 && (
                    <>
                      <div style={{ fontSize: 12, color: 'var(--nh-muted2)', margin: '14px 0 6px' }}>
                        Mã lịch sử tự do (NV_/Ngoai_/TTD_) — hệ thống không tự khớp được, cần đại ca soát tay riêng:
                      </div>
                      <table className="nh-tbl">
                        <thead>
                          <tr><th>Ngày</th><th>Pháp nhân / người vay</th><th>Ngân hàng</th><th className="r">Số tiền</th></tr>
                        </thead>
                        <tbody>
                          {khongXacDinhRows.map(r => (
                            <tr key={r.key}>
                              <td>{r.ngayThucTe}</td>
                              <td>{r.entity}</td>
                              <td>{r.nganHang}</td>
                              <td className="r">{VND.format(r.soTienThucTe ?? 0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
