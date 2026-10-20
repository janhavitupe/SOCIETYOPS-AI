import { useNavigate } from '@tanstack/react-router';
import { VendorDirectory } from '@/components/VendorDirectory';
import { useShell } from '../AppShell';
import { useTicketActions, useTickets, useVendors } from '../queries';

export function VendorsPage() {
  const { isDarkMode } = useShell();
  const navigate = useNavigate();
  const tickets = useTickets();
  const vendors = useVendors();
  const { assign } = useTicketActions();

  const assignToOldestOpenTicket = (vendorId: string) => {
    const openTicket = (tickets.data ?? []).find((t) => t.status === 'Open');
    if (!openTicket) {
      alert('No unassigned open ticket found right now. All open tickets are dispatched!');
      return;
    }
    assign.mutate({ ticketId: openTicket.id, vendorId }, { onSuccess: () => navigate({ to: '/manager' }) });
  };

  return (
    <VendorDirectory
      vendors={vendors.data ?? []}
      isDarkMode={isDarkMode}
      onAssignVendorToOpenTicket={assignToOldestOpenTicket}
    />
  );
}
