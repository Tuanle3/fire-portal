import {
  collection, doc, setDoc, deleteDoc,
  onSnapshot, Unsubscribe,
} from 'firebase/firestore'
import { tasksDb } from './firebase-tasks'

export type UserLevel  = 'giam_doc' | 'truong_phong' | 'nhan_vien'
export type AppModule  = 'tasks' | 'users' | 'finance' | 'projects' | 'assets' | 'data'

export interface StaffUser {
  id: string
  name: string
  email: string
  department: string
  position: string
  level: UserLevel
  modules: AppModule[]   // which modules this user can access
  active: boolean
  createdAt: string
}

export const LEVEL_LABEL: Record<UserLevel, string> = {
  giam_doc:     'Giám đốc',
  truong_phong: 'Trưởng phòng',
  nhan_vien:    'Nhân viên',
}

export const LEVEL_COLOR: Record<UserLevel, { bg: string; color: string; border: string }> = {
  giam_doc:     { bg: '#FFF7ED', color: '#9A3412', border: '#FED7AA' },
  truong_phong: { bg: '#EFF6FF', color: '#1E40AF', border: '#BFDBFE' },
  nhan_vien:    { bg: '#F0FDF4', color: '#166534', border: '#BBF7D0' },
}

export const MODULE_META: Record<AppModule, { label: string; icon: string; desc: string; color: string }> = {
  tasks:    { label: 'Công việc',        icon: '✓',  desc: 'Xem & quản lý công việc',       color: '#1C3557' },
  finance:  { label: 'Tài chính',        icon: '💰', desc: 'Báo cáo & dòng tiền',           color: '#D97706' },
  projects: { label: 'Dự án',            icon: '📁', desc: 'Quản lý dự án',                 color: '#7C3AED' },
  assets:   { label: 'Tài sản',          icon: '🏦', desc: 'Tài sản đảm bảo',               color: '#0891B2' },
  data:     { label: 'Nhật ký dòng tiền',icon: '📊', desc: 'Dữ liệu dòng tiền',            color: '#16A34A' },
  users:    { label: 'Quản lý User',     icon: '👥', desc: 'Thêm/sửa/xóa nhân viên',       color: '#DC2626' },
}

const COL = 'staff_users'

function clean(u: StaffUser): Record<string, unknown> {
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(u)) obj[k] = v ?? null
  return obj
}

function parse(id: string, d: Record<string, unknown>): StaffUser {
  return {
    id,
    name:       (d.name       as string)     ?? '',
    email:      (d.email      as string)     ?? '',
    department: (d.department as string)     ?? '',
    position:   (d.position   as string)     ?? '',
    level:      (d.level      as UserLevel)  ?? 'nhan_vien',
    modules:    (d.modules    as AppModule[]) ?? [],
    active:     (d.active     as boolean)    ?? true,
    createdAt:  (d.createdAt  as string)     ?? '',
  }
}

export async function saveUser(u: StaffUser): Promise<void> {
  await setDoc(doc(tasksDb, COL, u.id), clean(u))
}

export async function deleteUser(id: string): Promise<void> {
  await deleteDoc(doc(tasksDb, COL, id))
}

export function subscribeToUsers(cb: (users: StaffUser[]) => void): Unsubscribe {
  return onSnapshot(collection(tasksDb, COL), snap => {
    const list = snap.docs.map(d => parse(d.id, d.data() as Record<string, unknown>))
    list.sort((a, b) => {
      const lo: Record<UserLevel, number> = { giam_doc: 0, truong_phong: 1, nhan_vien: 2 }
      if (a.department !== b.department) return a.department.localeCompare(b.department)
      return lo[a.level] - lo[b.level]
    })
    cb(list)
  })
}
