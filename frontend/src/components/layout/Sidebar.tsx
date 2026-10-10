import { NavLink } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { LayoutDashboard, Building2, Mail, FileText, Shield, History, Upload, LogOut, Tag } from 'lucide-react';

export default function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  const menuItems = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/companies', icon: Building2, label: 'Empresas' },
    { to: '/groups', icon: Tag, label: 'Grupos' },
    { to: '/campaigns', icon: Mail, label: 'Campanhas' },
    { to: '/templates', icon: FileText, label: 'Templates' },
    { to: '/import', icon: Upload, label: 'Importar CSV' },
    ...(isAdmin ? [
      { to: '/users', icon: Shield, label: 'Usuários' },
      { to: '/audit', icon: History, label: 'Auditoria' },
    ] : []),
  ];

  return (
    <aside className="w-64 bg-card border-r flex flex-col">
      <div className="p-6 border-b">
        <h1 className="text-xl font-bold text-primary">CRM Enterprise</h1>
        <p className="text-xs text-muted-foreground mt-1">Gerenciamento & Comunicação</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'}`}>
            <item.icon className="h-4 w-4" />{item.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t">
        <div className="mb-3">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold mt-1 bg-secondary">
            {user?.role === 'ADMIN' ? 'Administrador' : 'Operador'}
          </span>
        </div>
        <button onClick={logout} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors">
          <LogOut className="h-4 w-4" />Sair
        </button>
      </div>
    </aside>
  );
}
