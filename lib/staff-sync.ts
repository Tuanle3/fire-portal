import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore'
import { tasksDb } from './firebase-tasks'

const COL = 'staff_users'

export async function syncStaffUser(id: string, data: {
  name: string
  email: string
  department?: string | null
  level?: string | null
  position?: string | null
}) {
  // only write to staff_users when the user has dept or level set
  if (!data.department && !data.level) return

  const ref  = doc(tasksDb, COL, id)
  const snap = await getDoc(ref)
  const existing = snap.exists() ? snap.data() : {}

  await setDoc(ref, {
    ...existing,
    id,
    name:       data.name,
    email:      data.email || '',
    department: data.department  || existing.department || '',
    level:      data.level       || existing.level      || 'nhan_vien',
    position:   data.position    || existing.position   || '',
    active:     true,
    createdAt:  existing.createdAt || new Date().toISOString().slice(0, 10),
    modules:    existing.modules   || [],
  })
}

export async function removeStaffUser(id: string) {
  await deleteDoc(doc(tasksDb, COL, id))
}
