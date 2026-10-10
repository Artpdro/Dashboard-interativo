import { useEffect, useState } from 'react';
import api from '@/services/api';
import { SmtpConfig } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Edit, Server, PlugZap, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiError } from '@/lib/format';
import { notify } from '@/lib/notify';

type Security = 'starttls' | 'ssl';
const emptyForm = { name: '', host: '', port: '587', user: '', password: '', from: '', fromName: '', security: 'starttls' as Security, isDefault: false, isActive: true, testTo: '' };
type Form = typeof emptyForm;

export default function SmtpConfigPage() {
  const [configs, setConfigs] = useState<SmtpConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState<SmtpConfig | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState('');
  const [dialogMsg, setDialogMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadConfigs = async () => {
    try { const res = await api.get('/smtp'); setConfigs(res.data.data); setLoadError(''); }
    catch (e) { setLoadError(apiError(e, 'Não foi possível carregar as configurações SMTP')); }
    finally { setLoading(false); }
  };
  useEffect(() => { loadConfigs(); }, []);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setDialogMsg(null); setShowDialog(true); };
  const openEdit = (c: SmtpConfig) => {
    setEditing(c);
    // A senha nunca vem da API: campo vazio = manter a senha salva.
    setForm({ name: c.name, host: c.host, port: String(c.port), user: c.user, password: '', from: c.from, fromName: c.fromName || '', security: c.secure ? 'ssl' : 'starttls', isDefault: c.isDefault, isActive: c.isActive, testTo: '' });
    setDialogMsg(null); setShowDialog(true);
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Porta 465 = SSL implícito; 587/25 = STARTTLS. Ajuda a evitar a combinação porta/segurança incorreta.
  const onPortChange = (v: string) => setForm((f) => ({ ...f, port: v, security: v.trim() === '465' ? 'ssl' : f.port.trim() === '465' ? 'starttls' : f.security }));

  const payload = () => ({
    name: form.name, host: form.host.trim(), port: Number(form.port), user: form.user.trim(),
    from: form.from.trim(), fromName: form.fromName.trim(), secure: form.security === 'ssl',
    isDefault: form.isDefault, isActive: form.isActive,
    ...(form.password ? { password: form.password } : {}),
  });

  const handleSave = async () => {
    setSaving(true); setDialogMsg(null);
    try {
      if (editing) await api.put(`/smtp/${editing.id}`, payload());
      else await api.post('/smtp', payload());
      notify.success('Configuração SMTP salva');
      setShowDialog(false);
      loadConfigs();
    } catch (e) { setDialogMsg({ ok: false, text: apiError(e, 'Erro ao salvar') }); }
    finally { setSaving(false); }
  };

  // Testa os dados DIGITADOS (antes de salvar); em edição, sem senha nova usa a salva.
  const handleTestDraft = async () => {
    setTesting('draft'); setDialogMsg(null);
    try {
      const res = await api.post('/smtp/test', { ...payload(), id: editing?.id, to: form.testTo.trim() || undefined });
      setDialogMsg({ ok: true, text: res.data.message });
    } catch (e) { setDialogMsg({ ok: false, text: apiError(e, 'Falha no teste') }); }
    finally { setTesting(''); }
  };

  const handleTestSaved = async (c: SmtpConfig) => {
    setTesting(c.id);
    try {
      const res = await api.post(`/smtp/${c.id}/test`);
      notify.success('Conexão SMTP OK', res.data.message);
    } catch (e) { notify.error('Falha no teste SMTP', apiError(e)); }
    finally { setTesting(''); }
  };

  const handleDelete = async (c: SmtpConfig) => {
    if (!confirm(`Excluir a configuração "${c.name}"?`)) return;
    try { await api.delete(`/smtp/${c.id}`); notify.success('Configuração excluída'); loadConfigs(); }
    catch (e) { notify.error('Não foi possível excluir', apiError(e)); }
  };

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-primary">Configuração SMTP</h1>
          <p className="text-sm text-muted-foreground">Servidor usado em todos os envios (individuais, grupos e campanhas). A senha é guardada criptografada e nunca é exibida.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Nova configuração</Button>
      </div>

      {loadError && <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{loadError}</div>}
      {!loadError && configs.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhuma configuração SMTP cadastrada. Crie uma para poder enviar e-mails.</CardContent></Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {configs.map((c) => (
          <Card key={c.id}>
            <CardContent className="p-5 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <Server className="h-5 w-5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold truncate">{c.name}</h3>
                      {c.isDefault && <Badge>Padrão</Badge>}
                      {!c.isActive && <Badge variant="secondary">Inativa</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">{c.host}:{c.port} · {c.secure ? 'SSL' : 'TLS/STARTTLS'}</p>
                    <p className="text-xs text-muted-foreground truncate">{c.fromName ? `${c.fromName} <${c.from}>` : c.from}</p>
                    {!c.hasPassword && <p className="text-xs text-destructive">Senha não configurada</p>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(c)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => handleDelete(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <Button variant="outline" size="sm" className="mt-4" disabled={testing === c.id} onClick={() => handleTestSaved(c)}>
                {testing === c.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1" />}Testar conexão
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={(o) => !saving && setShowDialog(o)}>
        <DialogContent className="max-w-xl p-4 sm:p-6">
          <DialogHeader><DialogTitle>{editing ? 'Editar configuração SMTP' : 'Nova configuração SMTP'}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2"><label htmlFor="s-name" className="text-sm font-medium">Nome da configuração *</label><Input id="s-name" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Ex.: Servidor principal" /></div>
            <div className="space-y-1"><label htmlFor="s-host" className="text-sm font-medium">Servidor SMTP *</label><Input id="s-host" value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="smtp.seudominio.com.br" /></div>
            <div className="space-y-1"><label htmlFor="s-port" className="text-sm font-medium">Porta *</label><Input id="s-port" inputMode="numeric" value={form.port} onChange={(e) => onPortChange(e.target.value)} /></div>
            <div className="space-y-1"><label htmlFor="s-sec" className="text-sm font-medium">Segurança</label>
              <select id="s-sec" value={form.security} onChange={(e) => set('security', e.target.value as Security)} className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="starttls">TLS (STARTTLS) — porta 587</option>
                <option value="ssl">SSL — porta 465</option>
              </select>
            </div>
            <div className="space-y-1"><label htmlFor="s-user" className="text-sm font-medium">Usuário / e-mail de autenticação *</label><Input id="s-user" autoComplete="off" value={form.user} onChange={(e) => set('user', e.target.value)} /></div>
            <div className="space-y-1 sm:col-span-2"><label htmlFor="s-pass" className="text-sm font-medium">Senha {editing ? '' : '*'}</label>
              <Input id="s-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder={editing?.hasPassword ? '•••••••• (deixe em branco para manter a senha atual)' : ''} />
            </div>
            <div className="space-y-1"><label htmlFor="s-from" className="text-sm font-medium">E-mail do remetente *</label><Input id="s-from" type="email" value={form.from} onChange={(e) => set('from', e.target.value)} /></div>
            <div className="space-y-1"><label htmlFor="s-fname" className="text-sm font-medium">Nome do remetente</label><Input id="s-fname" value={form.fromName} onChange={(e) => set('fromName', e.target.value)} placeholder="Ex.: Sindnorte" /></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isDefault} onChange={(e) => set('isDefault', e.target.checked)} />Definir como padrão</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.isActive} onChange={(e) => set('isActive', e.target.checked)} />Configuração ativa</label>
          </div>

          <div className="rounded-lg border bg-secondary/40 p-3 space-y-2">
            <p className="text-sm font-semibold text-primary">Testar antes de salvar</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input aria-label="E-mail para o teste (opcional)" type="email" placeholder="E-mail para receber o teste (opcional)" value={form.testTo} onChange={(e) => set('testTo', e.target.value)} />
              <Button type="button" variant="outline" onClick={handleTestDraft} disabled={testing === 'draft'}>
                {testing === 'draft' ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlugZap className="h-4 w-4 mr-1" />}Testar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Sem e-mail de destino, apenas a conexão e o login são verificados.</p>
          </div>

          {dialogMsg && (
            <div role={dialogMsg.ok ? 'status' : 'alert'} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${dialogMsg.ok ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive'}`}>
              {dialogMsg.ok ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />}<span>{dialogMsg.text}</span>
            </div>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
