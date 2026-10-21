import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/context/AuthContext';

const NEW_SOCIETY = '__new__';

/**
 * The active society's name, and for people in more than one, a picker to
 * move between them. Switching re-reads the session and drops every cached
 * query, since all of it belonged to the previous society.
 */
export function SocietySwitcher({ fallbackName }: { fallbackName: string }) {
  const { societies, activeSocietyId, switchSociety } = useAuth();
  const navigate = useNavigate();

  if (societies.length <= 1) {
    return <span className="text-xs text-[#71716A] dark:text-slate-400 font-medium">{fallbackName}</span>;
  }

  return (
    <select
      aria-label="Switch society"
      value={activeSocietyId ?? ''}
      onChange={async (e) => {
        if (e.target.value === NEW_SOCIETY) {
          navigate({ to: '/societies/new' });
          return;
        }
        await switchSociety(e.target.value);
        navigate({ to: '/' });
      }}
      className="max-w-56 truncate rounded border border-[#E5E5E1] bg-transparent px-1.5 py-0.5 text-xs font-medium text-[#71716A] dark:border-[#2D2D2A] dark:text-slate-300"
    >
      {societies.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
      <option value={NEW_SOCIETY}>+ Set up another society</option>
    </select>
  );
}
