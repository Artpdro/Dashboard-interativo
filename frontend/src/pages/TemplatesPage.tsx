import { useEffect, useState } from 'react';
import api from '@/services/api';
import { EmailTemplate } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, FileText, Trash2, Edit, Copy, Eye, PenLine } from 'lucide-react';

const VARIABLES = ['{{nome}}', '{{empresa}}', '{{email}}', '{{cidade}}', '{{estado}}', '{{valor_vencido}}', '{{valor_pago}}', '{{valor_a_vencer}}', '{{rua}}', '{{numero}}', '{{bairro}}', '{{cep}}', '{{telefone}}', '{{documento}}'];

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [formData, setFormData] = useState({ name: '', subject: '', body: '', signature: '' });

  useEffect(() => { loadTemplates(); }, []);

  const loadTemplates = async () => {
    try { const res = await api.get('/templates'); setTemplates(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleSave = async () => {
    try {
      if (editingTemplate) {
        await api.put(`/templates/${editingTemplate.id}`, formData);
      } else {
        await api.post('/templates', { ...formData, variables: VARIABLES });
      }
      setShowDialog(false); setEditingTemplate(null); setFormData({ name: '', subject: '', body: '', signature: '' }); loadTemplates();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este template?')) return;
    try { await api.delete(`/templates/${id}`); loadTemplates(); } catch (e) { console.error(e); }
  };

  const handleDuplicate = async (id: string) => {
    try { await api.post(`/templates/${id}/duplicate`); loadTemplates(); } catch (e) { console.error(e); }
  };

  const openEdit = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setFormData({ name: template.name, subject: template.subject, body: template.body, signature: template.signature || '' });
    setShowDialog(true);
  };

  const insertVariable = (variable: string) => {
    setFormData({ ...formData, body: formData.body + ' ' + variable });
  };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Templates de E-mail</h1>
        <Button onClick={() => { setEditingTemplate(null); setFormData({ name: '', subject: '', body: '', signature: '' }); setShowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />Novo Template
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setPreviewTemplate(template)}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <h3 className="font-semibold">{template.name}</h3>
                    <p className="text-sm text-muted-foreground truncate max-w-[200px]">{template.subject}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); openEdit(template); }}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDuplicate(template.id); }}><Copy className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={(e) => { e.stopPropagation(); handleDelete(template.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {template.signature && (
                <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <PenLine className="h-3 w-3" /> Com assinatura
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Nome</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Assunto</label><Input value={formData.subject} onChange={(e) => setFormData({ ...formData, subject: e.target.value })} /></div>
            <div>
              <label className="text-sm font-medium">Corpo do E-mail</label>
              <Textarea value={formData.body} onChange={(e) => setFormData({ ...formData, body: e.target.value })} placeholder="Digite o conteúdo do e-mail..." rows={6} />
            </div>
            <div>
              <label className="text-sm font-medium flex items-center gap-2"><PenLine className="h-4 w-4" />Assinatura</label>
              <Textarea value={formData.signature} onChange={(e) => setFormData({ ...formData, signature: e.target.value })} placeholder="Digite a assinatura que aparecerá no final de todos os e-mails enviados com este template..." rows={4} />
              <p className="text-xs text-muted-foreground mt-1">A assinatura será automaticamente adicionada ao final de cada e-mail.</p>
            </div>
            <div>
              <label className="text-sm font-medium">Variáveis disponíveis:</label>
              <div className="flex flex-wrap gap-2 mt-2">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => insertVariable(v)} className="text-xs bg-secondary px-2 py-1 rounded hover:bg-secondary/80 transition-colors">{v}</button>
                ))}
              </div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingTemplate ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{previewTemplate?.name}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-3 rounded"><p className="text-sm font-medium">Assunto:</p><p>{previewTemplate?.subject}</p></div>
            <div className="bg-muted p-3 rounded min-h-[200px]">
              <p className="text-sm font-medium mb-2">Corpo:</p>
              <div className="whitespace-pre-wrap text-sm" dangerouslySetInnerHTML={{ __html: previewTemplate?.body.replace(/\n/g, '<br/>') || '' }} />
            </div>
            {previewTemplate?.signature && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-1">Assinatura:</p>
                <div className="whitespace-pre-wrap text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: previewTemplate.signature.replace(/\n/g, '<br/>') }} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
