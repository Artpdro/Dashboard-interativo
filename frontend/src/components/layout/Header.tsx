import { Bell, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function Header() {
  return (
    <header className="h-16 border-b bg-card flex items-center justify-between px-6">
      <div className="flex items-center gap-4 flex-1">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Pesquisar..." className="max-w-md border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0" />
      </div>
      <div className="flex items-center gap-4">
        <button className="relative p-2 hover:bg-accent rounded-md transition-colors">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1 right-1 h-2 w-2 bg-primary rounded-full" />
        </button>
      </div>
    </header>
  );
}
