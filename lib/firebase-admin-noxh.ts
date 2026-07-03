import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function app() {
  const existing = getApps().find(a => a.name === 'noxh')
  if (existing) return existing
  return initializeApp({
    credential: cert({
      projectId: process.env.NOXH_FIREBASE_PROJECT_ID,
      clientEmail: process.env.NOXH_FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.NOXH_FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  }, 'noxh')
}

export function noxhFirestore() {
  return getFirestore(app())
}
