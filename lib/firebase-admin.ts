import { getApps, initializeApp, cert, App } from 'firebase-admin/app'
import { getDatabase, Database } from 'firebase-admin/database'

let _app: App | undefined
let _db: Database | undefined

// Chịu lỗi khi dán env: bỏ khoảng trắng/tab thừa và dấu ngoặc kép/đơn bao ngoài.
function clean(v: string | undefined): string {
  let s = (v ?? '').trim()
  if (s.length >= 2 &&
    ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'")))) {
    s = s.slice(1, -1)
  }
  return s
}

export function getAdminDb(): Database {
  if (_db) return _db

  const projectId   = clean(process.env.FIREBASE_PROJECT_ID) || clean(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID)
  const clientEmail = clean(process.env.FIREBASE_CLIENT_EMAIL)
  const privateKey  = clean(process.env.FIREBASE_PRIVATE_KEY).replace(/\\n/g, '\n')
  const databaseURL = clean(process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL)

  _app = getApps().find(a => a.name === 'admin') ?? initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), databaseURL },
    'admin',
  )
  _db = getDatabase(_app)
  return _db
}
