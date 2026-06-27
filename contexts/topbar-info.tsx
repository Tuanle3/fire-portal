'use client'
import { createContext, useContext, useState } from 'react'

const Ctx = createContext<{ info: string; setInfo: (s: string) => void }>({
  info: '', setInfo: () => {},
})

export function TopbarInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState('')
  return <Ctx.Provider value={{ info, setInfo }}>{children}</Ctx.Provider>
}

export const useTopbarInfo = () => useContext(Ctx)
