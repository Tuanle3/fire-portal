export function fetchNoxhTable(table: string): Promise<{ data: any[] | null; error: any }> {
  return fetch(`/api/noxh-firestore?table=${encodeURIComponent(table)}`, { cache: 'no-store' })
    .then(async r => {
      const body = await r.json()
      if (r.status === 401 && typeof window !== 'undefined') {
        window.location.href = '/login'
      }
      return body
    })
    .catch(e => ({ data: null, error: String(e) }))
}
