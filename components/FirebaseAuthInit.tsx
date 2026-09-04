'use client'
import { useEffect } from 'react'
import { ensureAnonAuth } from '@/lib/firebase'

export default function FirebaseAuthInit() {
  useEffect(() => { ensureAnonAuth() }, [])
  return null
}