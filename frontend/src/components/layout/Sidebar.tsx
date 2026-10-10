import { NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Building2, Mail, FileText, Shield, History, Upload, LogOut, Tag, Server, X } from 'lucide-react';

interface SidebarProps { open: boolean; onClose: () => void }

export default function Sidebar({ open, onClose }: SidebarProps) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const menuItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/companies', icon: Building2, label: 'Empresas' },
    { to: '/groups', icon: Tag, label: 'Grupos' },
    { to: '/campaigns', icon: Mail, label: 'Campanhas' },
    { to: '/templates', icon: FileText, label: 'Templates' },
    { to: '/import', icon: Upload, label: 'Importar planilha' },
    // A configuração SMTP é restrita a administradores (a rota e a API também exigem ADMIN).
    ...(isAdmin
      ? [
          { to: '/smtp', icon: Server, label: 'Configuração SMTP' },
          { to: '/users', icon: Shield, label: 'Usuários' },
          { to: '/audit', icon: History, label: 'Auditoria' },
        ]
      : []),
  ];

  return (
    <>
      {open && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-sidebar text-sidebar-foreground flex flex-col transition-transform duration-200 lg:static lg:z-auto lg:w-64 lg:max-w-none lg:translate-x-0 lg:min-h-screen ${open ? 'translate-x-0' : '-translate-x-full'}`}
        aria-label="Menu principal"
      >
        <div className="p-5 border-b border-white/10 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">SINDNORTE</h1>
            <p className="text-xs text-sidebar-foreground/70 mt-1">CRM · Gerenciamento & Comunicação</p>
            <div className="mt-3 h-1 w-10 rounded bg-accent" />
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar menu" className="lg:hidden p-2 -mr-2 rounded-md hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                  isActive ? 'bg-accent text-accent-foreground' : 'text-sidebar-foreground/85 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="mb-3 min-w-0">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-xs text-sidebar-foreground/70 truncate">{user?.email}</p>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold mt-1">
              {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
            </span>
          </div>
          <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-sm rounded-md hover:bg-white/10 transition-colors">
            <LogOut className="h-4 w-4" />Sair
          </button>
        </div>
      </aside>
    </>
  );
}
