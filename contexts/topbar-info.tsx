'use client'
import { createContext, useContext, useState, ReactNode } from 'react'

interface TopbarCtx {
  info: string; setInfo: (s: string) => void
  left: ReactNode; setLeft: (n: ReactNode) => void       // khối bên trái topbar (vd breadcrumb + tiêu đề trang)
  right: ReactNode; setRight: (n: ReactNode) => void      // khối bên phải topbar, trước phần Admin/Đăng xuất
}

const Ctx = createContext<TopbarCtx>({
  info: '', setInfo: () => {},
  left: null, setLeft: () => {},
  right: null, setRight: () => {},
})

export function TopbarInfoProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState('')
  const [left, setLeft] = useState<ReactNode>(null)
  const [right, setRight] = useState<ReactNode>(null)
  return <Ctx.Provider value={{ info, setInfo, left, setLeft, right, setRight }}>{children}</Ctx.Provider>
}

export const useTopbarInfo = () => useContext(Ctx)
