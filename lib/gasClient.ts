export const GAS_URL  = 'https://script.google.com/macros/s/AKfycbzvGOlmdmiQkcXwp05RIrhtTAhw4lwPf3hO0u7ygjBerEwo0JGVLv22a0XLxX1Dsx4/exec'

/** POST data to GAS web app (write to Google Sheets). */
export async function writeToGAS(payload: Record<string, unknown>): Promise<void> {
  await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify(payload),
    mode: 'no-cors',
  })
}
