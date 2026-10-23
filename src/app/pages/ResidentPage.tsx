import { ResidentChat } from '@/components/ResidentChat';
import { MyTicketsPanel } from '@/components/MyTicketsPanel';
import { HouseholdPanel } from '@/components/HouseholdPanel';
import { useShell } from '../AppShell';
import { useRefreshAll } from '../queries';

export function ResidentPage() {
  const { isDarkMode, openTicket } = useShell();
  const refreshAll = useRefreshAll();

  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-2 sm:px-4 lg:grid-cols-[1fr_20rem]">
      <ResidentChat onTicketSelect={openTicket} isDarkMode={isDarkMode} onRefreshTickets={refreshAll} />
      <div className="grid content-start gap-4 lg:pt-4">
        <HouseholdPanel />
        <MyTicketsPanel onOpen={openTicket} />
      </div>
    </div>
  );
}
