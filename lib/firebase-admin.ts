import { getApps, initializeApp, cert, App } from 'firebase-admin/app'
import { getDatabase, Database } from 'firebase-admin/database'

let _app: App | undefined
let _db: Database | undefined

export function getAdminDb(): Database {
  if (_db) return _db

  const projectId   = process.env.FIREBASE_PROJECT_ID   || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!
  const privateKey  = (process.env.FIREBASE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  const databaseURL = process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL!

  _app = getApps().find(a => a.name === 'admin') ?? initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }), databaseURL },
    'admin',
  )
  _db = getDatabase(_app)
  return _db
}
