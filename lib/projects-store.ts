import { collection, doc, setDoc, deleteDoc, onSnapshot, Unsubscribe } from 'firebase/firestore'
import { tasksDb } from './firebase-tasks'

export interface Project {
  id: string
  name: string
  color: string
  createdAt: string
}

const COL = 'projects'

export const DEFAULT_PROJECT_COLORS = [
  '#1C3557','#D97706','#7C3AED','#0891B2','#DC2626',
  '#16A34A','#DB2777','#2563EB','#0D9488','#9A3412',
]

export async function saveProject(p: Project): Promise<void> {
  await setDoc(doc(tasksDb, COL, p.id), p)
}

export async function deleteProject(id: string): Promise<void> {
  await deleteDoc(doc(tasksDb, COL, id))
}

export function subscribeToProjects(cb: (list: Project[]) => void): Unsubscribe {
  return onSnapshot(collection(tasksDb, COL), snap => {
    const list = snap.docs.map(d => d.data() as Project)
    list.sort((a, b) => a.name.localeCompare(b.name, 'vi'))
    cb(list)
  })
}
