import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { Database, getDatabase } from 'firebase/database'
import { Firestore, getFirestore } from 'firebase/firestore'

let _app: FirebaseApp | undefined
let _db: Database | undefined
let _fs: Firestore | undefined

function getMainApp(): FirebaseApp {
  if (_app) return _app
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
  return _app
}

export function getDb(): Database {
  if (_db) return _db
  _db = getDatabase(getMainApp())
  return _db
}

export function getMainFirestore(): Firestore {
  if (_fs) return _fs
  _fs = getFirestore(getMainApp())
  return _fs
}
