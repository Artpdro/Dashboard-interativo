import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Company } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { EMAIL_VARIABLES } from '@/lib/emailVariables';
import { ArrowLeft, Building2, Mail, MapPin, DollarSign, Save, Trash2, Send } from 'lucide-react';

export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Company>>({});
  const [showEmail, setShowEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailData, setEmailData] = useState({ subject: '', body: '' });

  useEffect(() => { if (id) loadCompany(); }, [id]);

  const loadCompany = async () => {
    try { const res = await api.get(`/companies/${id}`); setCompany(res.data.data); setFormData(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleUpdate = async () => {
    try { await api.put(`/companies/${id}`, formData); setEditing(false); loadCompany(); alert('Atualizado!'); }
    catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handleDelete = async () => {
    if (!confirm('Excluir empresa?')) return;
    try { await api.delete(`/companies/${id}`); navigate('/companies'); }
    catch (e) { console.error(e); }
  };

  const openEmailDialog = () => {
    if (!company?.email) { alert('Empresa sem e-mail'); return; }
    setEmailData({ subject: '', body: '' });
    setShowEmail(true);
  };

  const handleSendEmail = async () => {
    if (!emailData.subject.trim() || !emailData.body.trim()) { alert('Preencha o assunto e o corpo do e-mail'); return; }
    setSending(true);
    try {
      await api.post('/campaigns/send-single', { companyId: id, subject: emailData.subject, body: emailData.body });
      setShowEmail(false);
      alert('E-mail enviado!');
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao enviar'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Carregando...</div>;
  if (!company) return <div>Empresa não encontrada</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/companies')}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-3xl font-bold">{company.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={openEmailDialog}><Send className="h-4 w-4 mr-2" />Enviar E-mail</Button>
          <Button variant="outline" onClick={() => setEditing(!editing)}>{editing ? 'Cancelar' : 'Editar'}</Button>
          {editing && <Button onClick={handleUpdate}><Save className="h-4 w-4 mr-2" />Salvar</Button>}
          <Button variant="destructive" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Informações Gerais</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div><label className="text-sm font-medium">Nome</label><Input value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Empresa/Fantasia</label><Input value={formData.companyName || ''} onChange={(e) => setFormData({ ...formData, companyName: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Documento</label><Input value={formData.document || ''} onChange={(e) => setFormData({ ...formData, document: e.target.value })} /></div>
              </>
            ) : (
              <>
                <p><span className="text-muted-foreground">Nome:</span> {company.name}</p>
                <p><span className="text-muted-foreground">Empresa:</span> {company.companyName || '-'}</p>
                <p><span className="text-muted-foreground">Documento:</span> {company.document || '-'}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" />Contato</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div><label className="text-sm font-medium">E-mail</label><Input value={formData.email || ''} onChange={(e) => setFormData({ ...formData, email: e.target.value })} /></div>
                <div><label className="text-sm font-medium">E-mails Adicionais</label><Input value={formData.additionalEmails || ''} onChange={(e) => setFormData({ ...formData, additionalEmails: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Celular</label><Input value={formData.phone || ''} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Fone Fixo</label><Input value={formData.landline || ''} onChange={(e) => setFormData({ ...formData, landline: e.target.value })} /></div>
              </>
            ) : (
              <>
                <p><span className="text-muted-foreground">E-mail:</span> {company.email || '-'}</p>
                <p><span className="text-muted-foreground">Celular:</span> {company.phone || '-'}</p>
                <p><span className="text-muted-foreground">Fixo:</span> {company.landline || '-'}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary" />Endereço</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div><label className="text-sm font-medium">Rua</label><Input value={formData.street || ''} onChange={(e) => setFormData({ ...formData, street: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Número</label><Input value={formData.number || ''} onChange={(e) => setFormData({ ...formData, number: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Bairro</label><Input value={formData.neighborhood || ''} onChange={(e) => setFormData({ ...formData, neighborhood: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Cidade</label><Input value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Estado</label><Input value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} /></div>
                <div><label className="text-sm font-medium">CEP</label><Input value={formData.zipCode || ''} onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })} /></div>
              </>
            ) : (
              <>
                <p><span className="text-muted-foreground">Endereço:</span> {company.street} {company.number} {company.complement}</p>
                <p><span className="text-muted-foreground">Bairro:</span> {company.neighborhood || '-'}</p>
                <p><span className="text-muted-foreground">Cidade/Estado:</span> {company.city ? `${company.city}/${company.state}` : '-'}</p>
                <p><span className="text-muted-foreground">CEP:</span> {company.zipCode || '-'}</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" />Financeiro</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {editing ? (
              <>
                <div><label className="text-sm font-medium">Valor Vencido</label><Input type="number" value={formData.overdueAmount || ''} onChange={(e) => setFormData({ ...formData, overdueAmount: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Valor Pago</label><Input type="number" value={formData.paidAmount || ''} onChange={(e) => setFormData({ ...formData, paidAmount: e.target.value })} /></div>
                <div><label className="text-sm font-medium">Valor a Vencer</label><Input type="number" value={formData.dueAmount || ''} onChange={(e) => setFormData({ ...formData, dueAmount: e.target.value })} /></div>
              </>
            ) : (
              <>
                <p><span className="text-muted-foreground">Vencido:</span> <Badge variant="destructive">R$ {Number(company.overdueAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Badge></p>
                <p><span className="text-muted-foreground">Pago:</span> <Badge variant="default">R$ {Number(company.paidAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Badge></p>
                <p><span className="text-muted-foreground">A vencer:</span> <Badge variant="secondary">R$ {Number(company.dueAmount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Badge></p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showEmail} onOpenChange={setShowEmail}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Enviar e-mail para {company.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Assunto</label><Input value={emailData.subject} onChange={(e) => setEmailData({ ...emailData, subject: e.target.value })} /></div>
            <div>
              <label className="text-sm font-medium">Mensagem</label>
              <RichTextEditor value={emailData.body} onChange={(html) => setEmailData((prev) => ({ ...prev, body: html }))} placeholder="Digite o conteúdo do e-mail..." minHeight={200} variables={EMAIL_VARIABLES} />
            </div>
            <Button onClick={handleSendEmail} disabled={sending} className="w-full"><Send className="h-4 w-4 mr-2" />{sending ? 'Enviando...' : 'Enviar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
