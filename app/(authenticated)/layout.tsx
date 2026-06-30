import AppShell from '@/components/AppShell'
import { TopbarInfoProvider } from '@/contexts/topbar-info'
import { DashUnitProvider } from '@/contexts/dash-unit'
import { UserSessionProvider } from '@/contexts/user-session'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <TopbarInfoProvider>
      <UserSessionProvider>
        <DashUnitProvider>
          <AppShell>{children}</AppShell>
        </DashUnitProvider>
      </UserSessionProvider>
    </TopbarInfoProvider>
  )
}
