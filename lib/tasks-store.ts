import {
  collection, doc, getDocs, setDoc, deleteDoc,
  onSnapshot, Unsubscribe, writeBatch,
} from 'firebase/firestore'
import { tasksDb } from './firebase-tasks'
import { Task, MOCK_TASKS } from './tasks-mock'

const COL = 'tasks'

function toFirestore(t: Task): Record<string, unknown> {
  // Firestore doesn't accept undefined values
  const obj: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(t)) {
    obj[k] = v ?? null
  }
  return obj
}

function fromFirestore(id: string, data: Record<string, unknown>): Task {
  return {
    id,
    title:       (data.title       as string)  ?? '',
    description: (data.description as string)  ?? '',
    assignedBy:  (data.assignedBy  as string)  ?? '',
    assignedTo:  (data.assignedTo  as string)  ?? '',
    department:  (data.department  as string)  ?? '',
    project:     (data.project     as string)  ?? '',
    priority:    (data.priority    as Task['priority']) ?? 'trung',
    status:      (data.status      as Task['status'])   ?? 'chua_bat_dau',
    progress:    Number(data.progress ?? 0),
    deadline:    (data.deadline    as string)  ?? '',
    notes:       (data.notes       as string)  ?? '',
    dienBien:    (data.dienBien    as string)  ?? '',
    deXuat:      (data.deXuat      as string)  ?? '',
    parentId:    (data.parentId    as string)  || undefined,
    sharedWith:  (data.sharedWith  as string[]) || undefined,
    evaluation:  (data.evaluation  as Task['evaluation']) || undefined,
    extensions:  (data.extensions  as Task['extensions']) || undefined,
    createdAt:   (data.createdAt   as string)  ?? '',
    updatedAt:   (data.updatedAt   as string)  ?? '',
  }
}

export async function fetchTasks(): Promise<Task[]> {
  const snap = await getDocs(collection(tasksDb, COL))
  return snap.docs.map(d => fromFirestore(d.id, d.data() as Record<string, unknown>))
}

export async function saveTask(task: Task): Promise<void> {
  await setDoc(doc(tasksDb, COL, task.id), toFirestore(task))
}

export async function deleteTask(id: string): Promise<void> {
  await deleteDoc(doc(tasksDb, COL, id))
}

export function subscribeToTasks(cb: (tasks: Task[]) => void): Unsubscribe {
  return onSnapshot(collection(tasksDb, COL), snap => {
    cb(snap.docs.map(d => fromFirestore(d.id, d.data() as Record<string, unknown>)))
  })
}

export async function seedMockTasks(): Promise<void> {
  const batch = writeBatch(tasksDb)
  MOCK_TASKS.forEach(t => {
    batch.set(doc(tasksDb, COL, t.id), toFirestore(t))
  })
  await batch.commit()
}
