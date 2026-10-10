import { useEffect, useState } from 'react';
import { renderEmailHtml } from '@/lib/emailHtml';
import { useParams, useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { EmailCampaign, EmailLog } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowLeft, Send, Pause, X, Paperclip } from 'lucide-react';

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<EmailCampaign | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (id) loadCampaign(); }, [id]);

  const loadCampaign = async () => {
    try {
      const res = await api.get(`/campaigns/${id}`);
      setCampaign(res.data.data);
      setLogs(res.data.data.emailLogs || []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSend = async () => {
    if (!confirm('Iniciar envio?')) return;
    try { await api.post(`/campaigns/${id}/send`); loadCampaign(); alert('Campanha iniciada!'); }
    catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handlePause = async () => {
    try { await api.post(`/campaigns/${id}/pause`); loadCampaign(); }
    catch (e) { console.error(e); }
  };

  const handleCancel = async () => {
    if (!confirm('Cancelar campanha?')) return;
    try { await api.post(`/campaigns/${id}/cancel`); loadCampaign(); }
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

  if (loading) return <div className="flex items-center justify-center h-64">Carregando...</div>;
  if (!campaign) return <div>Campanha não encontrada</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/campaigns')}><ArrowLeft className="h-4 w-4" /></Button>
          <h1 className="text-3xl font-bold">{campaign.name}</h1>
          {getStatusBadge(campaign.status)}
        </div>
        <div className="flex gap-2">
          {campaign.status === 'DRAFT' && <Button onClick={handleSend}><Send className="h-4 w-4 mr-2" />Iniciar Envio</Button>}
          {campaign.status === 'SENDING' && <Button variant="outline" onClick={handlePause}><Pause className="h-4 w-4 mr-2" />Pausar</Button>}
          {(campaign.status === 'DRAFT' || campaign.status === 'PAUSED') && <Button variant="destructive" onClick={handleCancel}><X className="h-4 w-4 mr-2" />Cancelar</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total</p><p className="text-2xl font-bold">{campaign.totalCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Enviados</p><p className="text-2xl font-bold text-green-600">{campaign.sentCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-bold text-yellow-600">{campaign.pendingCount}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Erros</p><p className="text-2xl font-bold text-red-600">{campaign.errorCount}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Detalhes</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <p><span className="text-muted-foreground">Assunto:</span> {campaign.subject}</p>
          <p><span className="text-muted-foreground">Corpo:</span></p>
          <div className="bg-muted p-3 rounded text-sm rte-content" dangerouslySetInnerHTML={{ __html: renderEmailHtml(campaign.body) }} />
          {campaign.signature && (
            <div className="border-t pt-2">
              <p className="text-sm text-muted-foreground">Assinatura:</p>
              <div className="text-sm rte-content" dangerouslySetInnerHTML={{ __html: renderEmailHtml(campaign.signature) }} />
            </div>
          )}
          {campaign.attachments && campaign.attachments.length > 0 && (
            <div className="pt-2">
              <p className="text-sm font-medium flex items-center gap-2"><Paperclip className="h-4 w-4" />Anexos:</p>
              <div className="flex flex-wrap gap-2 mt-1">
                {campaign.attachments.map(att => (
                  <Badge key={att.id} variant="outline">{att.originalName}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Logs de Envio</CardTitle></CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow><TableHead>Destinatário</TableHead><TableHead>Empresa</TableHead><TableHead>Status</TableHead><TableHead>Enviado em</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {logs.length === 0 ? <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Nenhum log encontrado</TableCell></TableRow>
                  : logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell>{log.recipient}</TableCell>
                      <TableCell>{log.company?.name || '-'}</TableCell>
                      <TableCell>{log.status === 'SENT' ? <Badge>Enviado</Badge> : log.status === 'FAILED' ? <Badge variant="destructive">Erro</Badge> : <Badge variant="secondary">Pendente</Badge>}</TableCell>
                      <TableCell>{log.sentAt ? new Date(log.sentAt).toLocaleString('pt-BR') : '-'}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
