import { ManagerDashboard } from '@/components/ManagerDashboard';
import { useShell } from '../AppShell';
import { SetupChecklist } from '../SetupChecklist';
import {
  useAgentLogs,
  useAnalytics,
  useRefreshAll,
  useResidentProfiles,
  useSocietyProfile,
  useTicketActions,
  useTickets,
  useVendors,
} from '../queries';

export function ManagerPage() {
  const { isDarkMode, openTicket } = useShell();
  const tickets = useTickets();
  const vendors = useVendors();
  const agentLogs = useAgentLogs();
  const societyProfile = useSocietyProfile();
  const residentProfiles = useResidentProfiles();
  const analytics = useAnalytics();
  const actions = useTicketActions();
  const refreshAll = useRefreshAll();

  return (
    <>
      <SetupChecklist />
      <ManagerDashboard
        tickets={tickets.data ?? []}
        vendors={vendors.data ?? []}
        agentLogs={agentLogs.data ?? []}
        societyProfile={societyProfile.data ?? null}
        residentProfiles={residentProfiles.data ?? []}
        analytics={analytics.data ?? null}
        onTicketSelect={openTicket}
        onRefresh={refreshAll}
        isDarkMode={isDarkMode}
        onAssignVendor={(ticketId, vendorId) => actions.assign.mutate({ ticketId, vendorId })}
        onEscalateTicket={(ticketId, reason) => actions.escalate.mutate({ ticketId, reason })}
        onCloseTicket={(ticketId) => actions.close.mutate({ ticketId })}
      />
    </>
  );
}
