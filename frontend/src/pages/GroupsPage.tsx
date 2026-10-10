import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Group, CompanySlim } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Users, Trash2, Edit, Mail, Palette, Search, Check, X, ChevronUp, ChevronDown, Loader2, AlertCircle, ListChecks } from 'lucide-react';
import { formatDocument, apiError } from '@/lib/format';
import { notify } from '@/lib/notify';

const COLORS = ['#0B3C7D', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];
const PAGE_SIZE = 20;
const EMPTY_FILTERS = { name: '', document: '', city: '', neighborhood: '' };
type Filters = typeof EMPTY_FILTERS;
type SelectionMap = Record<string, CompanySlim>;

export default function GroupsPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Diálogo de criação/edição
  const [showDialog, setShowDialog] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [form, setForm] = useState({ name: '', description: '', color: COLORS[0] });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingGroup, setLoadingGroup] = useState(false);

  // Seleção COMPLETA do usuário (independente dos resultados exibidos) e a seleção original (edição).
  const [selected, setSelected] = useState<SelectionMap>({});
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [panelOpen, setPanelOpen] = useState(false); // painel recolhível em telas pequenas

  // Pesquisa
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [results, setResults] = useState<CompanySlim[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const requestId = useRef(0);

  const loadGroups = useCallback(async () => {
    try {
      const res = await api.get('/groups');
      setGroups(res.data.data);
      setLoadError('');
    } catch (e) {
      setLoadError(apiError(e, 'Não foi possível carregar os grupos'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadGroups(); }, [loadGroups]);

  const hasFilter = useMemo(() => Object.values(filters).some((v) => v.trim() !== ''), [filters]);

  const runSearch = useCallback(async (f: Filters, pageToLoad: number) => {
    const id = ++requestId.current;
    if (!Object.values(f).some((v) => v.trim() !== '')) {
      setResults([]); setTotal(0); setSearchError(''); setSearching(false);
      return;
    }
    setSearching(true);
    setSearchError('');
    try {
      const params: Record<string, string | number> = { page: pageToLoad, limit: PAGE_SIZE };
      (Object.keys(f) as Array<keyof Filters>).forEach((k) => { if (f[k].trim()) params[k] = f[k].trim(); });
      const res = await api.get('/groups/search-companies', { params });
      if (id !== requestId.current) return; // resposta antiga: ignora
      const data: CompanySlim[] = res.data.data;
      setResults((prev) => (pageToLoad === 1 ? data : [...prev, ...data.filter((c) => !prev.some((p) => p.id === c.id))]));
      setTotal(res.data.pagination?.total ?? data.length);
      setPage(pageToLoad);
    } catch (e) {
      if (id !== requestId.current) return;
      setSearchError(apiError(e, 'Erro ao pesquisar empresas'));
    } finally {
      if (id === requestId.current) setSearching(false);
    }
  }, []);

  // Pesquisa com debounce; filtros combinados; a seleção NÃO é tocada aqui.
  useEffect(() => {
    if (!showDialog) return;
    const t = setTimeout(() => runSearch(filters, 1), 350);
    return () => clearTimeout(t);
  }, [filters, showDialog, runSearch]);

  const selectedList = useMemo(
    () => Object.values(selected).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    [selected]
  );
  const selectedCount = selectedList.length;

  const toggleCompany = (c: CompanySlim) =>
    setSelected((prev) => {
      const next = { ...prev };
      if (next[c.id]) delete next[c.id]; else next[c.id] = c;
      return next;
    });

  const removeSelected = (id: string) =>
    setSelected((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

  const allResultsSelected = results.length > 0 && results.every((c) => selected[c.id]);
  const toggleAllResults = () =>
    setSelected((prev) => {
      const next = { ...prev };
      if (allResultsSelected) results.forEach((c) => delete next[c.id]);
      else results.forEach((c) => { next[c.id] = c; });
      return next;
    });

  const resetDialogState = () => {
    setForm({ name: '', description: '', color: COLORS[0] });
    setFormError(''); setSelected({}); setOriginalIds([]); setFilters(EMPTY_FILTERS);
    setResults([]); setTotal(0); setPage(1); setSearchError(''); setPanelOpen(false);
  };

  const openCreate = () => {
    resetDialogState();
    setEditingGroup(null);
    setShowDialog(true);
  };

  const openEdit = async (group: Group) => {
    resetDialogState();
    setEditingGroup(group);
    setForm({ name: group.name, description: group.description || '', color: group.color });
    setShowDialog(true);
    setLoadingGroup(true);
    try {
      // Carrega as empresas já associadas para que a edição parta da seleção real do grupo.
      const res = await api.get(`/groups/${group.id}`);
      const map: SelectionMap = {};
      (res.data.data.companies || []).forEach((cg: { company: CompanySlim }) => { map[cg.company.id] = cg.company; });
      setSelected(map);
      setOriginalIds(Object.keys(map));
    } catch (e) {
      setFormError(apiError(e, 'Não foi possível carregar as empresas do grupo'));
    } finally {
      setLoadingGroup(false);
    }
  };

  const closeDialog = (open: boolean) => {
    if (saving) return;
    setShowDialog(open);
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setFormError('Informe o nome do grupo'); return; }
    if (editingGroup && loadingGroup) return;
    setSaving(true);
    setFormError('');
    try {
      const ids = Object.keys(selected);
      if (editingGroup) {
        // Só envia a DIFERENÇA: as associações não modificadas são preservadas pelo servidor.
        const original = new Set(originalIds);
        const addCompanyIds = ids.filter((id) => !original.has(id));
        const removeCompanyIds = originalIds.filter((id) => !selected[id]);
        const res = await api.put(`/groups/${editingGroup.id}`, { ...form, addCompanyIds, removeCompanyIds });
        const ch = res.data.changes || { added: 0, removed: 0 };
        notify.success('Grupo atualizado', `${ch.added} empresa(s) adicionada(s), ${ch.removed} removida(s).`);
      } else {
        await api.post('/groups', { ...form, companyIds: ids });
        notify.success('Grupo criado', `${ids.length} empresa(s) no grupo.`);
      }
      setShowDialog(false);
      await loadGroups(); // atualiza a listagem e o contador de empresas
    } catch (e) {
      setFormError(apiError(e, 'Erro ao salvar o grupo'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (group: Group) => {
    if (!confirm(`Excluir o grupo "${group.name}"? As empresas não serão apagadas.`)) return;
    try {
      await api.delete(`/groups/${group.id}`);
      notify.success('Grupo excluído');
      loadGroups();
    } catch (e) {
      notify.error('Erro ao excluir', apiError(e));
    }
  };

  const setFilter = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando...</div>;

  const selectionPanel = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><ListChecks className="h-4 w-4" />Selecionadas</h3>
        <span className="inline-flex min-w-[1.75rem] justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground" aria-live="polite" data-testid="selected-count">{selectedCount}</span>
      </div>
      {loadingGroup ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando empresas do grupo...</p>
      ) : selectedCount === 0 ? (
        <p className="text-sm text-muted-foreground rounded-md border border-dashed p-4 text-center">Nenhuma empresa selecionada. Pesquise e clique nas empresas para adicioná-las.</p>
      ) : (
        <>
          <ul className="space-y-1 overflow-y-auto max-h-64 lg:max-h-none lg:flex-1 pr-1">
            {selectedList.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-md border bg-card px-2 py-1.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.document ? formatDocument(c.document) : 'Sem CNPJ'}</p>
                </div>
                <button type="button" onClick={() => removeSelected(c.id)} aria-label={`Remover ${c.name}`} className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <Button type="button" variant="ghost" size="sm" className="mt-2 text-destructive hover:text-destructive" onClick={() => setSelected({})}>Limpar seleção</Button>
        </>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">Grupos</h1>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Novo Grupo</Button>
      </div>

      {loadError && <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{loadError}</div>}
      {!loadError && groups.length === 0 && <p className="text-muted-foreground">Nenhum grupo cadastrado ainda.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {groups.map((group) => (
          <Card key={group.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-5 pt-5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center" style={{ backgroundColor: group.color + '20' }}>
                    <Palette className="h-5 w-5" style={{ color: group.color }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold truncate">{group.name}</h3>
                    <p className="text-sm text-muted-foreground truncate">{group.description || 'Sem descrição'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label="Editar grupo" onClick={() => openEdit(group)}><Edit className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Excluir grupo" onClick={() => handleDelete(group)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t">
                <div className="flex items-center gap-1 text-sm text-muted-foreground"><Users className="h-4 w-4" />{group._count?.companies || 0} empresas</div>
                <Button variant="outline" size="sm" className="ml-auto" onClick={() => navigate(`/campaigns?groupId=${group.id}`)}>
                  <Mail className="h-3 w-3 mr-1" />Campanha
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={closeDialog}>
        <DialogContent className="max-w-5xl p-4 sm:p-6">
          <DialogHeader><DialogTitle>{editingGroup ? `Editar grupo: ${editingGroup.name}` : 'Novo grupo'}</DialogTitle></DialogHeader>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4 min-w-0">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><label htmlFor="g-name" className="text-sm font-medium">Nome *</label><Input id="g-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="space-y-1"><label htmlFor="g-desc" className="text-sm font-medium">Descrição</label><Input id="g-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <div>
                <span className="text-sm font-medium">Cor</span>
                <div className="flex flex-wrap gap-2 mt-1">
                  {COLORS.map((c) => (
                    <button key={c} type="button" aria-label={`Cor ${c}`} className="w-8 h-8 rounded-full border-2" style={{ backgroundColor: c, borderColor: form.color === c ? '#0f172a' : 'transparent' }} onClick={() => setForm({ ...form, color: c })} />
                  ))}
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-3">
                <p className="text-sm font-semibold text-primary flex items-center gap-2"><Search className="h-4 w-4" />Pesquisar empresas</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input aria-label="Nome da empresa" placeholder="Nome da empresa" value={filters.name} onChange={(e) => setFilter('name', e.target.value)} />
                  <Input aria-label="CNPJ" placeholder="CNPJ (com ou sem pontuação)" inputMode="numeric" value={filters.document} onChange={(e) => setFilter('document', e.target.value)} />
                  <Input aria-label="Cidade" placeholder="Cidade" value={filters.city} onChange={(e) => setFilter('city', e.target.value)} />
                  <Input aria-label="Bairro" placeholder="Bairro" value={filters.neighborhood} onChange={(e) => setFilter('neighborhood', e.target.value)} />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{hasFilter ? (searching ? 'Pesquisando...' : `${total} resultado(s)`) : 'Use os filtros para encontrar empresas'}</span>
                  <div className="flex flex-wrap gap-2">
                    {results.length > 0 && <Button type="button" variant="outline" size="sm" onClick={toggleAllResults}>{allResultsSelected ? 'Desmarcar exibidas' : 'Selecionar exibidas'}</Button>}
                    {hasFilter && <Button type="button" variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</Button>}
                  </div>
                </div>

                {searchError && <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />{searchError}</div>}
                {hasFilter && !searching && !searchError && results.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">Nenhuma empresa encontrada com estes filtros.</p>}

                {results.length > 0 && (
                  <ul className="max-h-72 overflow-y-auto rounded-md border divide-y">
                    {results.map((c) => {
                      const isSel = Boolean(selected[c.id]);
                      return (
                        <li key={c.id}>
                          <button type="button" onClick={() => toggleCompany(c)} aria-pressed={isSel} className={`flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm hover:bg-secondary ${isSel ? 'bg-primary/10' : ''}`}>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{c.name}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {c.document ? formatDocument(c.document) : 'Sem CNPJ'}
                                {(c.city || c.neighborhood) && ` · ${[c.neighborhood, c.city].filter(Boolean).join(' – ')}`}
                              </p>
                            </div>
                            {isSel ? <Check className="h-4 w-4 shrink-0 text-success" /> : <Plus className="h-4 w-4 shrink-0 text-muted-foreground" />}
                          </button>
                        </li>
                      );
                    })}
                    {results.length < total && (
                      <li className="p-2 text-center">
                        <Button type="button" variant="ghost" size="sm" disabled={searching} onClick={() => runSearch(filters, page + 1)}>
                          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : `Carregar mais (${total - results.length})`}
                        </Button>
                      </li>
                    )}
                  </ul>
                )}
              </div>
            </div>

            {/* Sidebar de selecionadas: fixa ao lado em telas grandes; painel recolhível em telas pequenas */}
            <aside className="lg:border-l lg:pl-4 min-w-0" aria-label="Empresas selecionadas">
              <button type="button" className="lg:hidden flex w-full items-center justify-between rounded-md border bg-secondary px-3 py-2 text-sm font-semibold text-primary" onClick={() => setPanelOpen((o) => !o)} aria-expanded={panelOpen}>
                <span>Empresas selecionadas ({selectedCount})</span>
                {panelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <div className={`${panelOpen ? 'block' : 'hidden'} mt-2 lg:mt-0 lg:block lg:max-h-[26rem]`}>{selectionPanel}</div>
            </aside>
          </div>

          {formError && <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{formError}</div>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => closeDialog(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || loadingGroup}>{saving ? 'Salvando...' : editingGroup ? 'Salvar alterações' : 'Criar grupo'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
