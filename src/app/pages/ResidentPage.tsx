import { ResidentChat } from '@/components/ResidentChat';
import { useShell } from '../AppShell';
import { useRefreshAll } from '../queries';

export function ResidentPage() {
  const { isDarkMode, openTicket } = useShell();
  const refreshAll = useRefreshAll();

  return <ResidentChat onTicketSelect={openTicket} isDarkMode={isDarkMode} onRefreshTickets={refreshAll} />;
}
