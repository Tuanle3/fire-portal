'use client';

import { useMemo, useState } from 'react';
import { MODELS, defaults, fmt, sensitivity, type Mode, type Params } from './nhu-cau-vld-calc'
import type { DuNoRow } from './nhu-cau-vld-han-muc';

const MODES: { key: Mode; label: string }[] = [
  { key: 'xaylap', label: 'Công ty xây lắp' },
  { key: 'cdt', label: 'Chủ đầu tư' },
];

export default function TabNhuCauVLD({ duNo = [] }: { duNo?: DuNoRow[] }) {
  const [chon, setChon] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<Mode>('xaylap');
  const [pars, setPars] = useState<Record<Mode, Params>>({ xaylap: defaults('xaylap'), cdt: defaults('cdt') });

  const model = MODELS[mode];
  const p = pars[mode];
  const r = useMemo(() => model.calc(p), [model, p]);
  const sens = useMemo(() => sensitivity(mode, p), [mode, p]);

  const setVal = (id: string, v: number) =>
    setPars((s) => ({ ...s, [mode]: { ...s[mode], [id]: Number.isFinite(v) ? v : 0 } }));

  // Cơ cấu tài trợ cho tổng tài sản lưu động cần có
  const up = Math.max(r.upTotal, 0.0001);
  const eqUsed = Math.min(p.eq, Math.max(0, r.wc));
  const debtUsed = Math.min(p.debt, Math.max(0, r.wc - eqUsed));
  const seg = [
    { k: 'dn', label: 'Công nợ & ứng trước', v: r.dnTotal },
    { k: 'eq', label: 'Vốn tự có', v: eqUsed },
    { k: 'debt', label: 'Vay hiện có', v: debtUsed },
    { k: 'loan', label: 'Vay thêm', v: r.loan },
  ];
  const base = sens[model.sens.rowMults.indexOf(1)]?.[model.sens.colDeltas.indexOf(0)] ?? r.loan;

  return (
    <div className="vld">
      <style>{CSS}</style>

      <div className="vld-top">
        <div className="vld-seg" role="tablist">
          {MODES.map((m) => (
            <button key={m.key} role="tab" aria-selected={mode === m.key}
              className={mode === m.key ? 'on' : ''} onClick={() => setMode(m.key)}>{m.label}</button>
          ))}
        </div>
        <button className="vld-reset" onClick={() => setPars((s) => ({ ...s, [mode]: defaults(mode) }))}>Đặt lại số liệu mẫu</button>
      </div>
      <p className="vld-sub"><b>{model.title}.</b> {model.sub} Đơn vị: tỷ đồng, 1 năm = 365 ngày.</p>

      <div className="vld-kpis">
        <div className="kpi k-a"><small>Nhu cầu vốn lưu động</small><b>{fmt(r.wc)}</b><i>Tài sản lưu động − nợ công nợ</i></div>
        <div className="kpi k-r"><small>Nhu cầu vay thêm</small><b>{fmt(r.loan)}</b><i>Sau khi trừ vốn tự có và vay hiện có</i></div>
        <div className="kpi k-b"><small>{r.ccc == null ? 'Tỷ trọng vay / nhu cầu' : 'Chu kỳ vốn (CCC)'}</small>
          <b>{r.ccc == null ? `${fmt(r.wc > 0 ? (r.loan / r.wc) * 100 : 0, 1)}%` : `${fmt(r.ccc, 0)} ngày`}</b>
          <i>{r.ccc == null ? 'Vay thêm ÷ Nhu cầu vốn lưu động' : 'DSO + DIO + WIP − DPO'}</i></div>
        <div className="kpi k-d"><small>Lãi vay dự kiến</small><b>{fmt(r.interest)}</b><i>Trong {p.mon} tháng, lãi {p.rate}%/năm</i></div>
      </div>

      <div className="vld-main">
        {/* CỘT TRÁI: các thẻ nhập liệu */}
        <div className="vld-inputs">
          {model.groups.map((g) => (
            <section key={g.key} className={`card g-${g.key}`}>
              <h3>{g.title}</h3>
              <div className="body">
                {g.fields.map((f) => (
                  <div className="in" key={f.id}>
                    <label htmlFor={`${mode}_${f.id}`}>{f.label}<em>{f.hint}</em></label>
                    <input id={`${mode}_${f.id}`} type="number" min={f.min} max={f.max} step={f.step}
                      value={p[f.id]} onChange={(e) => setVal(f.id, e.target.value === '' ? 0 : Number(e.target.value))} />
                    <input type="range" aria-label={f.label} min={f.min} max={f.max} step={f.step}
                      value={Math.min(f.max, Math.max(f.min, p[f.id]))} onChange={(e) => setVal(f.id, Number(e.target.value))} />
                  </div>
                ))}
                {g.key === 'd' && duNo.length > 0 && (
                  <div className="dn">
                    <b>Lấy từ Hạn mức tín dụng</b>
                    <div className="dn-list">
                      {duNo.map((d) => (
                        <label key={d.hopDongId}>
                          <input type="checkbox" checked={!!chon[d.hopDongId]}
                            onChange={(e) => setChon((c) => ({ ...c, [d.hopDongId]: e.target.checked }))} />
                          <span>{d.entity} · {d.nganHang} · {d.ten}{d.luuDong ? ' (lưu động)' : ''}</span>
                          <b>{fmt(d.duNo)}</b>
                        </label>
                      ))}
                    </div>
                    <button onClick={() => setVal('debt', Math.round(duNo.filter((d) => chon[d.hopDongId]).reduce((t, d) => t + d.duNo, 0) * 100) / 100)}>
                      Gán tổng đã chọn vào "Vay hiện có"
                    </button>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>

        {/* CỘT PHẢI: bảng tính, cơ cấu tài trợ, độ nhạy */}
        <div className="vld-out">
          <section className="card">
            <h3 className="h-dark">Bảng tính chi tiết</h3>
            <table className="vld-tbl">
              <thead><tr><th style={{ width: 28 }}>#</th><th>Khoản mục</th><th>Công thức</th><th>Thay số</th><th className="r">Giá trị</th></tr></thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.no} className={x.kind}>
                    <td><span className="no">{x.no}</span></td>
                    <td>{x.label}</td><td className="f">{x.formula}</td><td className="f">{x.subst}</td>
                    <td className="r n">{fmt(x.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="card">
            <h3 className="h-dark">Tài sản lưu động cần có được tài trợ bằng gì?</h3>
            <div className="body">
              <div className="bar">
                {seg.map((s) => s.v > 0.0001 && (
                  <div key={s.k} className={`s-${s.k}`} style={{ width: `${(s.v / up) * 100}%` }}
                    title={`${s.label}: ${fmt(s.v)} tỷ`}>{(s.v / up) * 100 >= 9 ? `${fmt((s.v / up) * 100, 0)}%` : ''}</div>
                ))}
              </div>
              <div className="leg">
                {seg.map((s) => <span key={s.k} className={`s-${s.k}`}>{s.label}: <b>{fmt(s.v)}</b></span>)}
              </div>
              {r.surplus > 0.005 && <p className="warn">Nguồn vốn tự có và vay hiện có đang dư {fmt(r.surplus)} tỷ so với nhu cầu, chưa cần vay thêm.</p>}
            </div>
          </section>

          <div className="vld-two">
            <section className="card">
              <h3 className="h-red">Độ nhạy: nhu cầu vay thêm (tỷ)</h3>
              <div className="body">
                <table className="vld-sens">
                  <thead><tr><th>{model.sens.rowTitle} \ {model.sens.colTitle}</th>
                    {model.sens.colDeltas.map((d) => <th key={d}>{fmt(Math.max(0, p[model.sens.colVar] + d), 0)}{model.sens.colUnit}</th>)}</tr></thead>
                  <tbody>
                    {model.sens.rowMults.map((m, i) => (
                      <tr key={m}><th>{fmt(p[model.sens.rowVar] * m, 0)} ({m * 100}%)</th>
                        {sens[i].map((v, j) => {
                          const isBase = m === 1 && model.sens.colDeltas[j] === 0;
                          const c = isBase ? 'eq' : v < base - 0.005 ? 'lo' : v > base + 0.005 ? 'hi' : '';
                          return <td key={j} className={c}>{fmt(v)}</td>;
                        })}</tr>
                    ))}
                  </tbody>
                </table>
                <div className="leg"><span className="s-base">Phương án hiện tại</span><span className="s-lo">Vay thấp hơn</span><span className="s-hi">Vay cao hơn</span></div>
              </div>
            </section>
            <section className="card">
              <h3 className="h-dark">Cách đọc màu</h3>
              <div className="body notes">
                {model.notes.map((n, i) => <p key={i} className={`n-${n.c}`}>{n.t}</p>)}
              </div>
            </section>
          </div>
        </div>
      </div>
      <p className="vld-foot">Số liệu mẫu để lập phương án vay vốn. Thay bằng số thực tế (báo cáo tài chính, hợp đồng, tiến độ thanh toán) trước khi nộp ngân hàng.</p>
    </div>
  );
}

const CSS = `
.vld{--navy:#1C3557;--gold:#D4A64A;--ink:#1b2430;--mut:#5d6b7a;--line:#dde2e8;
--a:#1f5fbf;--a-bg:#e8f0fc;--b:#c2610f;--b-bg:#fdf0e3;--c:#6b4bb8;--c-bg:#f0ebfa;--d:#1d7a4d;--d-bg:#e5f5ec;--r:#b42318;--r-bg:#fdeceb;
color:var(--ink);font-size:13px;line-height:1.4;padding:14px 4px}
.vld *{box-sizing:border-box}
.vld-top{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
.vld-seg{display:inline-flex;border:1px solid var(--navy);border-radius:8px;overflow:hidden}
.vld-seg button{border:0;background:#fff;color:var(--navy);padding:7px 18px;font:inherit;font-weight:600;cursor:pointer}
.vld-seg button.on{background:var(--navy);color:#fff;box-shadow:inset 0 -3px 0 var(--gold)}
.vld-reset{font:inherit;font-size:12px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:5px 12px;cursor:pointer}
.vld-sub{margin:8px 0 10px;color:var(--mut)}
.vld-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}
.kpi{border-radius:8px;padding:9px 12px;border-left:5px solid}
.kpi small{display:block;color:var(--mut);font-size:12px}
.kpi b{font-size:22px;font-variant-numeric:tabular-nums}
.kpi i{display:block;font-style:normal;font-size:11px;color:var(--mut)}
.k-a{background:var(--a-bg);border-color:var(--a)}.k-a b{color:var(--a)}
.k-r{background:var(--r-bg);border-color:var(--r)}.k-r b{color:var(--r)}
.k-b{background:var(--b-bg);border-color:var(--b)}.k-b b{color:var(--b)}
.k-d{background:var(--d-bg);border-color:var(--d)}.k-d b{color:var(--d)}
.vld-main{display:grid;grid-template-columns:340px 1fr;gap:12px;align-items:start}
.vld-inputs,.vld-out{display:flex;flex-direction:column;gap:10px;min-width:0}
.card{border:1px solid var(--line);border-radius:8px;overflow:hidden;background:#fff}
.card h3{margin:0;padding:6px 12px;font-size:13px;color:#fff}
.g-a h3{background:var(--a)}.g-b h3{background:var(--b)}.g-c h3{background:var(--c)}.g-d h3{background:var(--d)}
.h-dark{background:var(--navy)}.h-red{background:var(--r)}
.card .body{padding:6px 12px 8px}
.in{display:grid;grid-template-columns:1fr 84px;gap:2px 8px;align-items:center;padding:4px 0;border-bottom:1px dashed var(--line)}
.in:last-child{border:0}
.in label{font-weight:600;font-size:12.5px}
.in label em{display:block;font-style:normal;font-weight:400;color:var(--mut);font-size:11px}
.in input[type=number]{width:84px;font:inherit;font-weight:700;text-align:right;border:1px solid var(--line);border-radius:5px;padding:3px 6px}
.in input[type=range]{grid-column:1/3;width:100%;margin:0;height:14px}
.g-a input[type=range]{accent-color:var(--a)}.g-b input[type=range]{accent-color:var(--b)}.g-c input[type=range]{accent-color:var(--c)}.g-d input[type=range]{accent-color:var(--d)}
.dn{margin-top:8px;padding-top:6px;border-top:2px solid var(--d)}.dn-list{max-height:150px;overflow:auto;margin:4px 0}.dn-list label{display:grid;grid-template-columns:16px 1fr auto;gap:6px;font-size:11.5px;padding:2px 0;align-items:center}.dn button{width:100%;font:inherit;font-size:12px;font-weight:600;border:0;border-radius:6px;padding:5px;background:var(--d);color:#fff;cursor:pointer}
.vld-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.vld-tbl th{background:#eef1f5;text-align:left;padding:5px 8px;font-weight:600;color:var(--mut)}
.vld-tbl td{padding:5px 8px;border-bottom:1px solid var(--line)}
.r{text-align:right}.n{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}.f{color:var(--mut);font-size:11.5px}
.no{display:inline-block;min-width:20px;text-align:center;border-radius:10px;background:#e6eaef;font-size:11px;font-weight:700;padding:0 4px}
.vld-tbl tr.up{background:var(--b-bg)}.vld-tbl tr.up td:first-child{border-left:4px solid var(--b)}
.vld-tbl tr.dn{background:var(--d-bg)}.vld-tbl tr.dn td:first-child{border-left:4px solid var(--d)}
.vld-tbl tr.sub{background:var(--a-bg);font-weight:700}.vld-tbl tr.sub td:first-child{border-left:4px solid var(--a)}
.vld-tbl tr.base td:first-child{border-left:4px solid #9aa6b2}
.vld-tbl tr.res td{background:var(--navy);color:#fff;font-weight:700;border-bottom-color:var(--navy)}.vld-tbl tr.res .f{color:#c9d3e0}.vld-tbl tr.res .no{background:var(--gold);color:var(--navy)}
.vld-tbl tr.loan td{background:var(--r);color:#fff;font-weight:700;font-size:14px;border-bottom-color:var(--r)}.vld-tbl tr.loan .f{color:#ffd7d3}.vld-tbl tr.loan .no{background:#fff;color:var(--r)}
.bar{display:flex;height:26px;border-radius:6px;overflow:hidden;background:#eef1f5}
.bar div{color:#fff;font-size:11.5px;font-weight:700;display:flex;align-items:center;justify-content:center}
.s-dn{background:var(--d)}.s-eq{background:var(--a)}.s-debt{background:#7b8794}.s-loan{background:var(--r)}
.s-base{background:var(--a);color:#fff}.s-lo{background:var(--d-bg);color:var(--d)}.s-hi{background:var(--r-bg);color:var(--r)}
.leg{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:7px;font-size:12px}
.leg span:before{content:"";display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:5px;background:currentColor}
.leg span.s-dn{background:none;color:var(--d)}.leg span.s-eq{background:none;color:var(--a)}.leg span.s-debt{background:none;color:#7b8794}.leg span.s-loan{background:none;color:var(--r)}
.leg span.s-base,.leg span.s-lo,.leg span.s-hi{padding:1px 8px;border-radius:4px}.leg span.s-base:before,.leg span.s-lo:before,.leg span.s-hi:before{display:none}
.leg span b{color:var(--ink)}
.warn{margin:8px 0 0;padding:6px 10px;border-radius:6px;background:var(--d-bg);color:var(--d);font-size:12px}
.vld-two{display:grid;grid-template-columns:1.6fr 1fr;gap:10px}
.vld-sens{width:100%;border-collapse:collapse;font-size:12.5px;text-align:center}
.vld-sens th{background:#eef1f5;padding:4px;font-size:11.5px}
.vld-sens td{padding:5px 4px;border:1px solid var(--line);font-weight:700;font-variant-numeric:tabular-nums}
.vld-sens td.lo{background:var(--d-bg);color:var(--d)}.vld-sens td.hi{background:var(--r-bg);color:var(--r)}.vld-sens td.eq{background:var(--a);color:#fff}
.notes p{margin:0 0 5px;padding-left:8px;border-left:4px solid;font-size:12px}
.n-up{border-color:var(--b)}.n-dn{border-color:var(--d)}.n-sub{border-color:var(--a)}.n-loan{border-color:var(--r)}
.vld-foot{margin:10px 0 0;font-size:11.5px;color:var(--mut)}
@media (max-width:1100px){.vld-main{grid-template-columns:1fr}.vld-kpis{grid-template-columns:repeat(2,1fr)}.vld-two{grid-template-columns:1fr}.vld-out{overflow-x:auto}}
`;
