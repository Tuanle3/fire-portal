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

type SubTab = 'dai-han' | 'ngan-han' | 'dong-tien'

const TAB_ITEMS: { key: SubTab; label: string; icon: string }[] = [
  { key: 'ngan-han',  label: 'Hạn mức ngắn hạn',   icon: '⚡' },
  { key: 'dai-han',   label: 'Tín dụng dài hạn',   icon: '📋' },
  { key: 'dong-tien', label: 'Kế hoạch dòng tiền', icon: '📊' },
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
                    border: 'none',
                    background: 'none',
                    cursor: 'pointer',
                    padding: '8px 18px',
                    fontSize: 13.5,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--nh-navy)' : '#6b7280',
                    borderBottom: isActive ? '2px solid var(--nh-navy)' : '2px solid transparent',
                    marginBottom: -2,  // overlap border
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
        {activeTab === 'dai-han'   && <TabHanMuc />}
        {activeTab === 'ngan-han'  && <TabHanMucNganHan />}
        {activeTab === 'dong-tien' && <LichDongTienTongHop fmtTien={fmtTien} />}
      </div>
  )
}
