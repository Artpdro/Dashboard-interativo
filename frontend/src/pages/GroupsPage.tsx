import { useEffect, useState, useCallback } from 'react';
import api from '@/services/api';
import { Group, Company } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users, Trash2, Edit, Mail, Palette, Search, Check } from 'lucide-react';

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', color: '#3B82F6', companyIds: [] as string[] });
  const [searchCompany, setSearchCompany] = useState('');
  const [searchResults, setSearchResults] = useState<Company[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => { loadGroups(); }, []);

  const loadGroups = async () => {
    try { const res = await api.get('/groups'); setGroups(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const searchCompanies = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try { const res = await api.get('/groups/search-companies', { params: { q } }); setSearchResults(res.data.data); }
    catch (e) { console.error(e); } finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => searchCompanies(searchCompany), 300);
    return () => clearTimeout(timeout);
  }, [searchCompany, searchCompanies]);

  const toggleCompany = (companyId: string) => {
    setFormData(prev => ({ ...prev, companyIds: prev.companyIds.includes(companyId) ? prev.companyIds.filter(id => id !== companyId) : [...prev.companyIds, companyId] }));
  };

  const handleSave = async () => {
    try {
      if (editingGroup) {
        await api.put(`/groups/${editingGroup.id}`, { name: formData.name, description: formData.description, color: formData.color });
      } else {
        await api.post('/groups', formData);
      }
      setShowDialog(false); setEditingGroup(null); setFormData({ name: '', description: '', color: '#3B82F6', companyIds: [] }); setSearchCompany(''); setSearchResults([]); loadGroups();
    } catch (e: any) { alert(e.response?.data?.message || 'Erro'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este grupo?')) return;
    try { await api.delete(`/groups/${id}`); loadGroups(); } catch (e) { console.error(e); }
  };

  const openEdit = (group: Group) => { setEditingGroup(group); setFormData({ name: group.name, description: group.description || '', color: group.color, companyIds: [] }); setShowDialog(true); };
  const openCreate = () => { setEditingGroup(null); setFormData({ name: '', description: '', color: '#3B82F6', companyIds: [] }); setSearchCompany(''); setSearchResults([]); setShowDialog(true); };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Grupos</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo Grupo</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <Card key={group.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: group.color + '20' }}>
                    <Palette className="h-5 w-5" style={{ color: group.color }} />
                  </div>
                  <div>
                    <h3 className="font-semibold">{group.name}</h3>
                    <p className="text-sm text-muted-foreground">{group.description || 'Sem descrição'}</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(group)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(group.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" />{group._count?.companies || 0} empresas
                </div>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.location.href = `/campaigns?groupId=${group.id}`}>
                  <Mail className="h-3 w-3 mr-1" />Campanha
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editingGroup ? 'Editar Grupo' : 'Novo Grupo'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><label className="text-sm font-medium">Nome</label><Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Descrição</label><Input value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            <div><label className="text-sm font-medium">Cor</label>
              <div className="flex gap-2 mt-1">
                {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'].map(c => (
                  <button key={c} className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: c, borderColor: formData.color === c ? '#000' : 'transparent' }} onClick={() => setFormData({ ...formData, color: c })} />
                ))}
              </div>
            </div>
            {!editingGroup && (
              <div className="border rounded-lg p-3 space-y-2">
                <label className="text-sm font-medium flex items-center gap-2"><Search className="h-4 w-4" />Adicionar Empresas (opcional)</label>
                <Input placeholder="Digite CNPJ ou nome da empresa..." value={searchCompany} onChange={(e) => setSearchCompany(e.target.value)} />
                {searching && <p className="text-xs text-muted-foreground">Buscando...</p>}
                {searchResults.length > 0 && (
                  <div className="max-h-40 overflow-y-auto border rounded-md">
                    {searchResults.map((company) => (
                      <div key={company.id} className={`flex items-center justify-between p-2 text-sm cursor-pointer hover:bg-muted ${formData.companyIds.includes(company.id) ? 'bg-primary/10' : ''}`} onClick={() => toggleCompany(company.id)}>
                        <div>
                          <p className="font-medium">{company.name}</p>
                          <p className="text-xs text-muted-foreground">{company.document || ''} {company.city ? `- ${company.city}/${company.state}` : ''}</p>
                        </div>
                        {formData.companyIds.includes(company.id) ? <Check className="h-4 w-4 text-green-500" /> : <Plus className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    ))}
                  </div>
                )}
                {formData.companyIds.length > 0 && <p className="text-xs text-muted-foreground">{formData.companyIds.length} empresa(s) selecionada(s)</p>}
              </div>
            )}
            <Button onClick={handleSave} className="w-full">{editingGroup ? 'Salvar' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
