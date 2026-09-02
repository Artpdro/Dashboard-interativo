import { useEffect, useState } from 'react';
import api from '@/services/api';
import { User } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, Shield, User as UserIcon } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'OPERATOR' as 'ADMIN' | 'OPERATOR' });

  useEffect(() => { loadUsers(); }, []);

  const loadUsers = async () => {
    try { const res = await api.get('/auth/users'); setUsers(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleCreate = async () => {
    try { await api.post('/auth/register', formData); setShowDialog(false); setFormData({ name: '', email: '', password: '', role: 'OPERATOR' }); loadUsers(); }
    catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir usuário?')) return;
    try { await api.delete(`/auth/users/${id}`); loadUsers(); } catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Usuários</h1>
        <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-2" />Novo Usuário</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Nome</TableHead><TableHead>E-mail</TableHead><TableHead>Perfil</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-muted-foreground" />{user.name}</TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.role === 'ADMIN' ? <Badge><Shield className="h-3 w-3 mr-1" />Admin</Badge> : <Badge variant="secondary">Operador</Badge>}</TableCell>
                  <TableCell>{user.isActive ? <Badge variant="default">Ativo</Badge> : <Badge variant="destructive">Inativo</Badge>}</TableCell>
                  <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => handleDelete(user.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Usuário</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Nome</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">E-mail</label><Input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Senha</label><Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Perfil</label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}>
                <option value="OPERATOR">Operador</option>
                <option value="ADMIN">Administrador</option>
              </select>
            </div>
            <Button onClick={handleCreate} className="w-full">Criar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
