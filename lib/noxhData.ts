export function fetchNoxhTable(table: string): Promise<{ data: any[] | null; error: any }> {
  return fetch(`/api/noxh-firestore?table=${encodeURIComponent(table)}`, { cache: 'no-store' })
    .then(r => r.json())
    .catch(e => ({ data: null, error: String(e) }))
}
