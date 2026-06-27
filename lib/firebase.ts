import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { Database, getDatabase } from 'firebase/database'

let _app: FirebaseApp | undefined
let _db: Database | undefined

export function getDb(): Database {
  if (_db) return _db
  const config = {
    apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    databaseURL:       process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  }
  _app = getApps().find(a => a.name === '[DEFAULT]') ?? initializeApp(config)
  _db = getDatabase(_app)
  return _db
}
