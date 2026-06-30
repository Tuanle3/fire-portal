import AppShell from '@/components/AppShell'
import { TopbarInfoProvider } from '@/contexts/topbar-info'
import { DashUnitProvider } from '@/contexts/dash-unit'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <TopbarInfoProvider>
      <DashUnitProvider>
        <AppShell>{children}</AppShell>
      </DashUnitProvider>
    </TopbarInfoProvider>
  )
}
