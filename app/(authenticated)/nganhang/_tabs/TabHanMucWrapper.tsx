'use client'

/**
 * TabHanMucWrapper
 * ─────────────────────────────────────────────────────────────
 * Wrapper gộp 2 module tín dụng thành 1 giao diện có sub-tab:
 *   • "Ngắn hạn"  → TabHanMucNganHan (hạn mức khung + bộ hồ sơ giải ngân)
 *   • "Dài hạn"   → TabHanMuc   (hợp đồng tín dụng thông thường)
 *
 * Sử dụng:
 *   import { TabHanMucWrapper } from './_tabs/TabHanMucWrapper'
 *   <TabHanMucWrapper />
 * ─────────────────────────────────────────────────────────────
 */

import { useState } from 'react'
import { TabHanMuc }         from './TabHanMuc'
import { TabHanMucNganHan }  from './TabHanMucNganHan'
import LichDongTienTongHop   from '@/components/han-muc/LichDongTienTongHop'
import { DonViTienProvider, useDonViTien } from '@/lib/don-vi-tien-context'
import DonViTienSelect from '@/components/han-muc/DonViTienSelect'
import { FillStyles } from '@/components/han-muc/FillLayout'

type SubTab = 'dai-han' | 'ngan-han' | 'vay-ngoai' | 'dong-tien'

const TAB_ITEMS: { key: SubTab; label: string; icon: string }[] = [
  { key: 'ngan-han',  label: 'Hạn mức ngắn hạn',   icon: '⚡' },
  { key: 'dai-han',   label: 'Tín dụng dài hạn',   icon: '📋' },
  { key: 'vay-ngoai', label: 'Vay ngoài',          icon: '🤝' },
  { key: 'dong-tien', label: 'Tổng hợp lịch trả nợ', icon: '📊' },
]

export function TabHanMucWrapper() {
  const [activeTab, setActiveTab] = useState<SubTab>('ngan-han')

  return (
    <DonViTienProvider>
      <TabHanMucWrapperInner activeTab={activeTab} setActiveTab={setActiveTab} />
    </DonViTienProvider>
  )
}

function TabHanMucWrapperInner({
  activeTab, setActiveTab,
}: {
  activeTab: SubTab
  setActiveTab: (t: SubTab) => void
}) {
  const { fmtTien } = useDonViTien()

  return (
      <div>
        <FillStyles />
        {/* Sub-tab switcher */}
        <div style={{
          display: 'flex', gap: 4, marginBottom: 8, alignItems: 'center', justifyContent: 'space-between',
          borderBottom: '2px solid #e2e8f0', paddingBottom: 0, flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {TAB_ITEMS.map(tab => {
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    cursor: 'pointer',
                    padding: '8px 18px',
                    fontSize: 13.5,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? '#fff' : '#475569',
                    background: isActive ? 'var(--nh-navy)' : '#f1f5f9',
                    border: '1px solid ' + (isActive ? 'var(--nh-navy)' : '#e2e8f0'),
                    borderBottom: isActive ? '3px solid #D4A64A' : '1px solid #e2e8f0',
                    borderRadius: '8px 8px 0 0',
                    marginBottom: -2,  // overlap border
                    boxShadow: isActive ? '0 -2px 6px rgba(28,53,87,.18)' : 'none',
                    transition: 'all .15s',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                </button>
              )
            })}
          </div>
          <div style={{ marginBottom: 6 }}>
            <DonViTienSelect />
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'dai-han'   && <TabHanMuc mode="dai-han" />}
        {activeTab === 'vay-ngoai' && <TabHanMuc mode="vay-ngoai" />}
        {activeTab === 'ngan-han'  && <TabHanMucNganHan />}
        {activeTab === 'dong-tien' && <LichDongTienTongHop fmtTien={fmtTien} />}
      </div>
  )
}
