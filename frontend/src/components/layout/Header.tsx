import { Menu } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function Header({ onMenu }: { onMenu: () => void }) {
  const { user } = useAuth();
  return (
    <header className="h-14 sm:h-16 border-b bg-card flex items-center gap-3 px-4 sm:px-6 sticky top-0 z-30">
      <button
        type="button"
        onClick={onMenu}
        aria-label="Abrir menu"
        className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-md text-primary hover:bg-secondary"
      >
        <Menu className="h-5 w-5" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-primary truncate">Sindnorte · CRM</p>
        <p className="hidden sm:block text-xs text-muted-foreground truncate">Gerenciamento de empresas e comunicação</p>
      </div>
      {user && <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[14rem]">{user.name}</span>}
    </header>
  );
}
