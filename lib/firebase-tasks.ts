import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously } from 'firebase/auth'

const cfg = {
  apiKey:            process.env.NEXT_PUBLIC_TASKS_FIREBASE_API_KEY            ?? '',
  authDomain:        process.env.NEXT_PUBLIC_TASKS_FIREBASE_AUTH_DOMAIN        ?? '',
  projectId:         process.env.NEXT_PUBLIC_TASKS_FIREBASE_PROJECT_ID         ?? '',
  storageBucket:     process.env.NEXT_PUBLIC_TASKS_FIREBASE_STORAGE_BUCKET     ?? '',
  messagingSenderId: process.env.NEXT_PUBLIC_TASKS_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId:             process.env.NEXT_PUBLIC_TASKS_FIREBASE_APP_ID             ?? '',
}

const app = getApps().find(a => a.name === 'tasks') ?? initializeApp(cfg, 'tasks')
export const tasksDb = getFirestore(app)

let _tasksAuthReady: Promise<void> | undefined

export function ensureTasksAuth(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (_tasksAuthReady) return _tasksAuthReady
  const auth = getAuth(app)
  if (auth.currentUser) return Promise.resolve()
  _tasksAuthReady = signInAnonymously(auth)
    .then(() => undefined)
    .catch(e => {
      console.warn('[firebase-tasks] signInAnonymously failed:', e?.code || e)
    })
  return _tasksAuthReady
}