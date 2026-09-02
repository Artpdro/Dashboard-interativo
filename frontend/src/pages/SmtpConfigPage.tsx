import { useEffect, useState } from 'react';
import api from '@/services/api';
import { SmtpConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit, Check, Server } from 'lucide-react';

export default function SmtpConfigPage() {
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SmtpConfig | null>(null);
  const [formData, setFormData] = useState({ name: '', host: '', port: '587', user: '', password: '', from: 'sindnorteigarassu2019@hotmail.com', secure: false, isDefault: false });

  useEffect(() => { loadConfigs(); }, []);

  const loadConfigs = async () => {
    try { const res = await api.get('/smtp'); setConfigs(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      const payload = { ...formData, port: Number(formData.port), secure: Boolean(formData.secure) };
      if (editing) {
        await api.put(`/smtp/${editing.id}`, payload);
      } else {
        await api.post('/smtp', payload);
      }
      setShowDialog(false); setEditing(null); setFormData({ name: '', host: '', port: '587', user: '', password: '', from: 'sindnorteigarassu2019@hotmail.com', secure: false, isDefault: false }); loadConfigs();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir configuração?')) return;
    try { await api.delete(`/smtp/${id}`); loadConfigs(); } catch (e) { console.error(e); }
  };

  const handleTest = async (id: string) => {
    try { const res = await api.post(`/smtp/${id}/test`); alert(res.data.message); }
    catch (e: any) { alert(e.response?.data?.message || 'Erro no teste'); }
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Configurações SMTP</h1>
        <Button onClick={() => { setEditing(null); setFormData({ name: '', host: '', port: '587', user: '', password: '', from: 'sindnorteigarassu2019@hotmail.com', secure: false, isDefault: false }); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />Nova Configuração
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {configs.map((config) => (
          <Card key={config.id}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{config.name}</h3>
                      {config.isDefault && <Badge>Padrão</Badge>}
                      {!config.isActive && <Badge variant="secondary">Inativo</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">{config.host}:{config.port}</p>
                    <p className="text-xs text-muted-foreground">{config.from}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleTest(config.id)}><Check className="h-4 w-4 mr-1" />Testar</Button>
                  <Button variant="ghost" size="icon" onClick={() => { setEditing(config); setFormData({ ...config, port: String(config.port), password: '' }); setShowDialog(true); }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(config.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Editar SMTP' : 'Nova Configuração SMTP'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-sm font-medium">Nome</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Host</label><Input value={formData.host} onChange={(e) => setFormData({ ...formData, host: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Porta</label><Input value={formData.port} onChange={(e) => setFormData({ ...formData, port: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Usuário</label><Input value={formData.user} onChange={(e) => setFormData({ ...formData, user: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Senha</label><Input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} /></div>
            <div><label className="text-sm font-medium">E-mail de Envio (From)</label><Input value={formData.from} onChange={(e) => setFormData({ ...formData, from: e.target.value })} /></div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="secure" checked={formData.secure} onChange={(e) => setFormData({ ...formData, secure: e.target.checked })} />
              <label htmlFor="secure" className="text-sm">Usar TLS/SSL (Secure)</label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={formData.isDefault} onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })} />
              <label htmlFor="isDefault" className="text-sm">Definir como padrão</label>
            </div>
            <Button onClick={handleSave} className="w-full">{editing ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
