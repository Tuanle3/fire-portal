import { initializeApp, getApps, FirebaseApp } from 'firebase/app'
import { Database, getDatabase } from 'firebase/database'
import { Firestore, getFirestore } from 'firebase/firestore'
import { getAuth, signInAnonymously, onAuthStateChanged, Auth } from 'firebase/auth'

let _app: FirebaseApp | undefined
let _db: Database | undefined
let _fs: Firestore | undefined
let _auth: Auth | undefined
let _authReady: Promise<void> | undefined

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

export function getMainAuth(): Auth {
  if (_auth) return _auth
  _auth = getAuth(getMainApp())
  return _auth
}

// Đăng nhập ẩn danh (chỉ chạy ở trình duyệt) để mọi thao tác RTDB có auth != null.
// Gọi 1 lần, cache lại promise; nếu Anonymous auth chưa bật thì resolve êm (không chặn app).
export function ensureAnonAuth(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (_authReady) return _authReady
  const auth = getMainAuth()
  _authReady = new Promise<void>((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) { unsub(); resolve() }
    })
    if (!auth.currentUser) {
      signInAnonymously(auth).catch((e) => {
        console.warn('[firebase] Đăng nhập ẩn danh thất bại (kiểm tra đã bật Anonymous auth chưa):', e?.code || e)
        resolve()
      })
    }
  })
  return _authReady
}
