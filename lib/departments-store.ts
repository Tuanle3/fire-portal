import { collection, doc, setDoc, deleteDoc, onSnapshot, Unsubscribe } from 'firebase/firestore'
import { tasksDb } from './firebase-tasks'

export interface Department {
  id: string
  name: string
  color: string   // hex, for display
  createdAt: string
}

const COL = 'departments'

export const DEFAULT_COLORS = [
  '#1C3557','#D97706','#7C3AED','#0891B2','#DC2626',
  '#16A34A','#DB2777','#2563EB','#0D9488','#9A3412',
]

export async function saveDepartment(d: Department): Promise<void> {
  await setDoc(doc(tasksDb, COL, d.id), d)
}

export async function deleteDepartment(id: string): Promise<void> {
  await deleteDoc(doc(tasksDb, COL, id))
}

export function subscribeToDepartments(cb: (deps: Department[]) => void): Unsubscribe {
  return onSnapshot(collection(tasksDb, COL), snap => {
    const list = snap.docs.map(d => d.data() as Department)
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    cb(list)
  })
}
