import AppShell from '@/components/AppShell'
import FirebaseAuthGate from '@/components/FirebaseAuthGate'
import { TopbarInfoProvider } from '@/contexts/topbar-info'
import { DashUnitProvider } from '@/contexts/dash-unit'
import { UserSessionProvider } from '@/contexts/user-session'

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <FirebaseAuthGate>
      <TopbarInfoProvider>
        <UserSessionProvider>
          <DashUnitProvider>
            <AppShell>{children}</AppShell>
          </DashUnitProvider>
        </UserSessionProvider>
      </TopbarInfoProvider>
    </FirebaseAuthGate>
  )
}
