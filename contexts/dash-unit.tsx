'use client'
import { createContext, useContext, useState } from 'react'

type Unit = 'đ' | 'tr' | 'tỷ'

const Ctx = createContext<{ unit: Unit; setUnit: (u: Unit) => void }>({
  unit: 'đ', setUnit: () => {},
})

export function DashUnitProvider({ children }: { children: React.ReactNode }) {
  const [unit, setUnit] = useState<Unit>('đ')
  return <Ctx.Provider value={{ unit, setUnit }}>{children}</Ctx.Provider>
}

export const useDashUnit = () => useContext(Ctx)
