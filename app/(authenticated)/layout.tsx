import AppShell from '@/components/AppShell'
import { TopbarInfoProvider } from '@/contexts/topbar-info'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <TopbarInfoProvider>
      <AppShell>{children}</AppShell>
    </TopbarInfoProvider>
  )
}
