'use client'
import { useMemo, useState } from 'react'
import { BankRelation, BankProposal, BankNote, DANH_GIA_LABEL, TRANG_THAI_NH_LABEL, TRANG_THAI_PA_LABEL, isHoSoDangXuLy } from '@/lib/bank-types'
import { exportHoSoVayVonWord } from '@/lib/bank-baocao-word'

function fmtN(v: number): string { return v.toLocaleString('vi-VN') }

function trangThaiCls(t: BankRelation['trangThai']): string {
  if (t === 'dang_hop_tac') return 'nh-b-green'
  if (t === 'tiem_nang') return 'nh-b-blue'
  return 'nh-b-grey'
}

function danhGiaCls(d: BankRelation['danhGia']): string {
  if (d === 'tot') return 'nh-b-green'
  if (d === 'can_cai_thien') return 'nh-b-red'
  return 'nh-b-amber'
}

export function TabTongQuan({ relations, proposals, notes }: { relations: BankRelation[]; proposals: BankProposal[]; notes: BankNote[] }) {
  const [exporting, setExporting] = useState(false)

  const kpi = useMemo(() => {
    const dangHopTac = relations.filter(r => r.trangThai === 'dang_hop_tac')
    const tongHanMuc = dangHopTac.reduce((s, r) => s + r.hanMucHienTai, 0)
    const tongDuNo   = dangHopTac.reduce((s, r) => s + r.duNoHienTai, 0)
    const laiSuatBq  = dangHopTac.length
      ? dangHopTac.reduce((s, r) => s + r.laiSuatBinhQuan, 0) / dangHopTac.length
      : 0
    const dangXuLy = proposals.filter(p => isHoSoDangXuLy(p.trangThai)).length
    return { soLuong: dangHopTac.length, tongHanMuc, tongDuNo, laiSuatBq, dangXuLy }
  }, [relations, proposals])

  const doExportHoSo = async () => {
    setExporting(true)
    try {
      await exportHoSoVayVonWord({ printDate: new Date().toLocaleDateString('vi-VN'), relations, proposals, notes })
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button className="btn-primary" disabled={exporting} onClick={doExportHoSo}>
          {exporting ? 'Đang xuất...' : '⬇ Xuất báo cáo hồ sơ vay vốn hôm nay'}
        </button>
      </div>

      <div className="nh-kpi-row">
        <div className="nh-kpi">
          <span className="nh-kpi-label">Ngân hàng đang hợp tác</span>
          <span className="nh-kpi-val">{kpi.soLuong}</span>
          <span className="nh-kpi-sub">{kpi.dangXuLy} hồ sơ/phương án đang xử lý</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng hạn mức hiện tại</span>
          <span className="nh-kpi-val">{fmtN(kpi.tongHanMuc)}<span style={{ fontSize: 11, marginLeft: 2 }}>đ</span></span>
          <span className="nh-kpi-sub">Trên các NH đang hợp tác</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Tổng dư nợ hiện tại</span>
          <span className="nh-kpi-val" style={{ color: kpi.tongDuNo > 0 ? '#8C1F1F' : undefined }}>{fmtN(kpi.tongDuNo)}<span style={{ fontSize: 11, marginLeft: 2 }}>đ</span></span>
          <span className="nh-kpi-sub">{kpi.tongHanMuc > 0 ? (kpi.tongDuNo / kpi.tongHanMuc * 100).toFixed(1) : '0.0'}% hạn mức đã dùng</span>
        </div>
        <div className="nh-kpi">
          <span className="nh-kpi-label">Lãi suất bình quân</span>
          <span className="nh-kpi-val">{kpi.laiSuatBq.toFixed(2)}<span style={{ fontSize: 11, marginLeft: 2 }}>%/năm</span></span>
          <span className="nh-kpi-sub">Trung bình các NH đang hợp tác</span>
        </div>
      </div>

      <div className="nh-card">
        <div className="nh-card-head">
          <span className="nh-card-title">Danh sách ngân hàng</span>
          <span style={{ fontSize: 10.5, color: '#9CA3AF' }}>{relations.length} ngân hàng</span>
        </div>
        <div className="nh-card-body" style={{ padding: 0 }}>
          {relations.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: '#9CA3AF', fontSize: 12.5 }}>
              Chưa có ngân hàng nào — thêm ở tab &quot;Ngân hàng &amp; Phương án&quot;.
            </div>
          ) : (
            <table className="nh-tbl">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>NGÂN HÀNG</th>
                  <th style={{ minWidth: 110 }}>TRẠNG THÁI</th>
                  <th style={{ minWidth: 110 }}>ĐÁNH GIÁ</th>
                  <th className="r" style={{ minWidth: 120 }}>HẠN MỨC (đ)</th>
                  <th className="r" style={{ minWidth: 120 }}>DƯ NỢ (đ)</th>
                  <th className="r" style={{ minWidth: 90 }}>LÃI SUẤT</th>
                  <th className="r" style={{ minWidth: 90 }}>PHƯƠNG ÁN</th>
                </tr>
              </thead>
              <tbody>
                {relations.map(r => {
                  const rProposals = proposals.filter(p => p.nganHangId === r.id)
                  return (
                    <tr key={r.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: '#1F2430' }}>{r.tenNganHang}</div>
                        {r.chiNhanh && <div style={{ fontSize: 11, color: '#6B7280' }}>{r.chiNhanh}</div>}
                      </td>
                      <td><span className={`nh-badge ${trangThaiCls(r.trangThai)}`}>{TRANG_THAI_NH_LABEL[r.trangThai]}</span></td>
                      <td><span className={`nh-badge ${danhGiaCls(r.danhGia)}`}>{DANH_GIA_LABEL[r.danhGia]}</span></td>
                      <td className="r">{r.hanMucHienTai ? fmtN(r.hanMucHienTai) : '—'}</td>
                      <td className="r" style={{ color: r.duNoHienTai > 0 ? '#8C1F1F' : '#9CA3AF' }}>{r.duNoHienTai ? fmtN(r.duNoHienTai) : '—'}</td>
                      <td className="r">{r.laiSuatBinhQuan ? r.laiSuatBinhQuan.toFixed(2) + '%' : '—'}</td>
                      <td className="r" style={{ fontSize: 11, color: '#6B7280' }}>
                        {rProposals.length > 0 ? `${rProposals.length} (${TRANG_THAI_PA_LABEL[rProposals[0].trangThai]}${rProposals.length > 1 ? '...' : ''})` : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  )
}
