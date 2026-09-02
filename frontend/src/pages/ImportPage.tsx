import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileText, CheckCircle, AlertCircle } from 'lucide-react';

export default function ImportPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    setFile(selected);
    setResult(null);
    const formData = new FormData();
    formData.append('file', selected);
    try {
      const res = await api.post('/companies/preview-csv', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setPreview(res.data.data);
    } catch (e) { alert('Erro ao ler CSV'); }
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await api.post('/companies/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data.data);
    } catch (e: any) { alert(e.response?.data?.message || 'Erro na importação'); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/companies')}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-3xl font-bold">Importar Empresas (CSV)</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Arquivo CSV</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <Input type="file" accept=".csv" onChange={handleFileChange} />
          <p className="text-sm text-muted-foreground">O arquivo deve conter colunas como: Nome, Email, Celular, Empresa, CPF/CNPJ, Cidade, Estado, Valor Vencido, etc.</p>

          {preview && (
            <div className="border rounded-lg p-3 bg-muted">
              <p className="text-sm font-medium">Pré-visualização ({preview.totalRows} linhas):</p>
              <div className="overflow-x-auto mt-2">
                <table className="text-xs w-full">
                  <thead><tr className="border-b">{preview.columns.map((c: string) => <th key={c} className="text-left p-1">{c}</th>)}</tr></thead>
                  <tbody>{preview.rows.map((row: any, i: number) => <tr key={i} className="border-b">{preview.columns.map((c: string) => <td key={c} className="p-1 truncate max-w-[150px]">{row[c]}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          {result && (
            <div className="border rounded-lg p-4 bg-green-50 space-y-1">
              <div className="flex items-center gap-2 text-green-700 font-medium"><CheckCircle className="h-5 w-5" />Importação concluída!</div>
              <p className="text-sm text-green-700">{result.added} adicionadas | {result.updated} atualizadas | {result.ignored} ignoradas | {result.errors.length} erros</p>
              {result.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto text-xs text-red-600 bg-red-50 p-2 rounded">
                  {result.errors.map((err: any, i: number) => <div key={i}><AlertCircle className="h-3 w-3 inline mr-1" />Linha {err.row}: {err.message}</div>)}
                </div>
              )}
            </div>
          )}

          <Button onClick={handleImport} disabled={!file || loading} className="w-full">{loading ? 'Importando...' : 'Importar CSV'}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
