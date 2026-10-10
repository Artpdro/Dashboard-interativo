import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/services/api';
import { EmailCampaign, EmailTemplate, Group } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { EMAIL_VARIABLES } from '@/lib/emailVariables';
import { renderEmailHtml } from '@/lib/emailHtml';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Send, Pause, X, Trash2, Eye, Paperclip, FileText, PenLine } from 'lucide-react';

export default function CampaignsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: '', subject: '', body: '', signature: '', templateId: '', groupId: '', smtpConfigId: '' });
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const uploading = false;
  const [previewCampaign, setPreviewCampaign] = useState<EmailCampaign | null>(null);

  useEffect(() => {
    loadCampaigns(); loadTemplates(); loadGroups();
    const gId = searchParams.get('groupId');
    if (gId) { setFormData(prev => ({ ...prev, groupId: gId })); setShowDialog(true); }
  }, []);

  const loadCampaigns = async () => {
    try { const res = await api.get('/campaigns'); setCampaigns(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const loadTemplates = async () => {
    try { const res = await api.get('/templates'); setTemplates(res.data.data); }
    catch (e) { console.error(e); }
  };

  const loadGroups = async () => {
    try { const res = await api.get('/groups'); setGroups(res.data.data); }
    catch (e) { console.error(e); }
  };

  const handleTemplateChange = (templateId: string) => {
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setFormData(prev => ({ ...prev, templateId, subject: template.subject, body: template.body, signature: template.signature || '' }));
    } else {
      setFormData(prev => ({ ...prev, templateId: '' }));
    }
  };

  const handleCreate = async () => {
    try {
      const res = await api.post('/campaigns', formData);
      const campaignId = res.data.data.id;
      // Upload attachments
      for (const file of attachmentFiles) {
        const fd = new FormData();
        fd.append('file', file);
        await api.post(`/campaigns/${campaignId}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      }
      setShowDialog(false); setFormData({ name: '', subject: '', body: '', signature: '', templateId: '', groupId: '', smtpConfigId: '' }); setAttachmentFiles([]); loadCampaigns();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro ao criar campanha'); }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setAttachmentFiles(prev => [...prev, file]);
  };

  const removeAttachment = (index: number) => {
    setAttachmentFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async (id: string) => {
    if (!confirm('Iniciar envio da campanha?')) return;
    try { await api.post(`/campaigns/${id}/send`); loadCampaigns(); alert('Campanha iniciada!'); }
    catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handlePause = async (id: string) => {
    try { await api.post(`/campaigns/${id}/pause`); loadCampaigns(); }
    catch (e) { console.error(e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir campanha?')) return;
    try { await api.delete(`/campaigns/${id}`); loadCampaigns(); }
    catch (e) { console.error(e); }
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; variant: any }> = {
      DRAFT: { label: 'Rascunho', variant: 'secondary' },
      SENDING: { label: 'Enviando', variant: 'default' },
      COMPLETED: { label: 'Concluída', variant: 'default' },
      PAUSED: { label: 'Pausada', variant: 'outline' },
      CANCELLED: { label: 'Cancelada', variant: 'destructive' },
    };
    const s = map[status] || { label: status, variant: 'secondary' };
    return <Badge variant={s.variant}>{s.label}</Badge>;
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Campanhas de E-mail</h1>
        <Button onClick={() => setShowDialog(true)}><Plus className="h-4 w-4 mr-2" />Nova Campanha</Button>
      </div>

      <div className="space-y-3">
        {campaigns.map((campaign) => (
          <Card key={campaign.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setPreviewCampaign(campaign)}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="font-semibold">{campaign.name}</h3>
                    {getStatusBadge(campaign.status)}
                    {campaign.attachments && campaign.attachments.length > 0 && (
                      <Badge variant="outline" className="gap-1"><Paperclip className="h-3 w-3" />{campaign.attachments.length}</Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">{campaign.subject}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                    <span>Total: {campaign.totalCount}</span>
                    <span className="text-green-600">Enviados: {campaign.sentCount}</span>
                    <span className="text-yellow-600">Pendentes: {campaign.pendingCount}</span>
                    <span className="text-red-600">Erros: {campaign.errorCount}</span>
                  </div>
                </div>
                <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                  {campaign.status === 'DRAFT' && <Button size="sm" onClick={() => handleSend(campaign.id)}><Send className="h-3 w-3 mr-1" />Enviar</Button>}
                  {campaign.status === 'SENDING' && <Button size="sm" variant="outline" onClick={() => handlePause(campaign.id)}><Pause className="h-3 w-3 mr-1" />Pausar</Button>}
                  <Button size="sm" variant="ghost" onClick={() => navigate(`/campaigns/${campaign.id}`)}><Eye className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(campaign.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nova Campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Nome da Campanha</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Template</label>
              <Select value={formData.templateId} onValueChange={handleTemplateChange}>
                <SelectTrigger><SelectValue placeholder="Selecionar template (opcional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Grupo de Empresas</label>
              <Select value={formData.groupId} onValueChange={(v) => setFormData({ ...formData, groupId: v })}>
                <SelectTrigger><SelectValue placeholder="Selecionar grupo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Nenhum</SelectItem>
                  {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-sm font-medium">Assunto</label><Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Corpo do E-mail</label><RichTextEditor value={formData.body} onChange={(html) => setFormData((prev) => ({ ...prev, body: html }))} placeholder="Digite o conteúdo do e-mail..." minHeight={200} variables={EMAIL_VARIABLES} /></div>
            <div>
              <label className="text-sm font-medium flex items-center gap-2"><PenLine className="h-4 w-4" />Assinatura</label>
              <RichTextEditor value={formData.signature} onChange={(html) => setFormData((prev) => ({ ...prev, signature: html }))} placeholder="Assinatura que será adicionada ao final do e-mail..." minHeight={90} />
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <label className="text-sm font-medium flex items-center gap-2"><Paperclip className="h-4 w-4" />Anexos</label>
              <Input type="file" onChange={handleFileChange} disabled={uploading} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx" />
              <p className="text-xs text-muted-foreground">PDF, Imagens, Word, Excel</p>
              {attachmentFiles.length > 0 && (
                <div className="space-y-1">
                  {attachmentFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm bg-muted p-2 rounded">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeAttachment(idx)}><X className="h-3 w-3" /></Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <Button onClick={handleCreate} className="w-full">Criar Campanha</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewCampaign} onOpenChange={() => setPreviewCampaign(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{previewCampaign?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2">{getStatusBadge(previewCampaign?.status || '')}</div>
            <p className="text-sm text-muted-foreground">{previewCampaign?.subject}</p>
            <div className="bg-muted p-3 rounded text-sm rte-content" dangerouslySetInnerHTML={{ __html: renderEmailHtml(previewCampaign?.body) }} />
            {previewCampaign?.signature && (
              <div className="border-t pt-2 text-sm text-muted-foreground rte-content" dangerouslySetInnerHTML={{ __html: renderEmailHtml(previewCampaign.signature) }} />
            )}
            {previewCampaign?.attachments && previewCampaign.attachments.length > 0 && (
              <div className="space-y-1">
                <p className="text-sm font-medium">Anexos:</p>
                {previewCampaign.attachments.map(att => (
                  <div key={att.id} className="flex items-center gap-2 text-sm"><Paperclip className="h-3 w-3" />{att.originalName}</div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
