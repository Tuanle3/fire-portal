import { initializeApp, getApps, getApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const cfg = {
  apiKey:            process.env.NEXT_PUBLIC_TASKS_FIREBASE_API_KEY,
  authDomain:        process.env.NEXT_PUBLIC_TASKS_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.NEXT_PUBLIC_TASKS_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.NEXT_PUBLIC_TASKS_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_TASKS_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.NEXT_PUBLIC_TASKS_FIREBASE_APP_ID,
}

const app = getApps().find(a => a.name === 'tasks') ?? initializeApp(cfg, 'tasks')
export const tasksDb = getFirestore(app)
