import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Company } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Download, Upload, Trash2, Eye, ChevronLeft, ChevronRight, Building2, MapPin, FileText } from 'lucide-react';

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const navigate = useNavigate();

  useEffect(() => { loadCompanies(); }, [page, search]);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const response = await api.get('/companies', { params: { page, limit: 20, search: search || undefined } });
      setCompanies(response.data.data);
      setTotalPages(response.data.pagination?.totalPages || 1);
    } catch (error) { console.error(error); } finally { setLoading(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta empresa?')) return;
    try { await api.delete(`/companies/${id}`); loadCompanies(); } catch (error) { console.error(error); }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} empresas?`)) return;
    try { await api.post('/companies/batch-delete', { ids: selectedIds }); setSelectedIds([]); loadCompanies(); }
    catch (error) { console.error(error); }
  };

  const handleExport = async () => {
    try {
      const response = await api.post('/companies/export', selectedIds.length > 0 ? { ids: selectedIds } : {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `empresas_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) { console.error(error); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Empresas</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Exportar</Button>
          <Button variant="outline" onClick={() => navigate('/import')}><Upload className="h-4 w-4 mr-2" />Importar</Button>
          <Button onClick={() => navigate('/companies/new')}><Plus className="h-4 w-4 mr-2" />Nova Empresa</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Pesquisar por nome, e-mail, CPF/CNPJ..." className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            {selectedIds.length > 0 && <Button variant="destructive" onClick={handleBatchDelete}><Trash2 className="h-4 w-4 mr-2" />Excluir ({selectedIds.length})</Button>}
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"><input type="checkbox" onChange={(e) => setSelectedIds(e.target.checked ? companies.map(c => c.id) : [])} checked={selectedIds.length === companies.length && companies.length > 0} /></TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Financeiro</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8">Carregando...</TableCell></TableRow>
                  : companies.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma empresa encontrada</TableCell></TableRow>
                    : companies.map((company) => (
                      <TableRow key={company.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/companies/${company.id}`)}>
                        <TableCell onClick={(e) => e.stopPropagation()}><input type="checkbox" checked={selectedIds.includes(company.id)} onChange={() => toggleSelect(company.id)} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <Building2 className="h-4 w-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium truncate">{company.name}</p>
                              <p className="text-xs text-muted-foreground truncate">{company.companyName || ''}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {company.email && <p className="truncate">{company.email}</p>}
                            {company.phone && <p className="text-xs text-muted-foreground">{company.phone}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{company.city ? `${company.city}/${company.state}` : '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <FileText className="h-3 w-3 text-muted-foreground" />
                            <span>{company.document || '-'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {company.overdueAmount && Number(company.overdueAmount) > 0 ? (
                            <Badge variant="destructive" className="whitespace-nowrap">R$ {Number(company.overdueAmount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</Badge>
                          ) : <span className="text-sm text-muted-foreground">R$ 0,00</span>}
                        </TableCell>
                        <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/companies/${company.id}`)}><Eye className="h-4 w-4 mr-1" />Ver</Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(company.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">Página {page} de {totalPages}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
