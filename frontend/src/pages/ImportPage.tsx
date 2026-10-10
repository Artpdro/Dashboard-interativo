import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, UploadCloud } from 'lucide-react';
import { apiError } from '@/lib/format';
import { notify } from '@/lib/notify';

const MAX_MB = 10;
const EXTENSIONS = ['.xls', '.xlsx', '.csv'];

interface FieldDef { key: string; label: string; required: boolean }
interface PreviewData {
  fileName: string; fileType: string; sheetName?: string; delimiter?: string; encoding?: string;
  totalRows: number; headers: string[]; sampleRows: Array<Record<string, unknown>>;
  fields: FieldDef[]; suggestedMapping: Record<string, string>;
}
interface Summary { total: number; valid: number; invalid: number; newCount: number; duplicatesInDatabase: number; duplicatesInFile: number; withoutDocument: number }
interface RowInfo { row: number; status: string; errors: string[]; name: string; document: string; email: string; city: string; neighborhood: string; existingName?: string }
interface Analysis { summary: Summary; previewRows: RowInfo[]; issues: RowInfo[]; duplicates: RowInfo[] }
interface ImportResult {
  total: number; added: number; updated: number; ignored: number; rejected: number; mode: 'skip' | 'update';
  errors: Array<{ row: number; message: string }>; ignoredRows: Array<{ row: number; document: string; reason: string }>;
}

const STATUS_LABEL: Record<string, string> = {
  new: 'Nova', invalid: 'Inválida', duplicate_in_database: 'Já cadastrada', duplicate_in_file: 'Repetida no arquivo',
};
const STATUS_STYLE: Record<string, string> = {
  new: 'bg-success/10 text-success', invalid: 'bg-destructive/10 text-destructive',
  duplicate_in_database: 'bg-accent/30 text-accent-foreground', duplicate_in_file: 'bg-accent/30 text-accent-foreground',
};

export default function ImportPage() {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState<'' | 'preview' | 'analyze' | 'import'>('');
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null); setPreview(null); setMapping({}); setAnalysis(null); setResult(null);
    setError(''); setDuplicateMode('skip');
    if (inputRef.current) inputRef.current.value = '';
  };

  const buildForm = (f: File, withMapping: boolean) => {
    const fd = new FormData();
    fd.append('file', f);
    if (withMapping) fd.append('mapping', JSON.stringify(mapping));
    return fd;
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    reset();
    const ext = selected.name.toLowerCase().slice(selected.name.lastIndexOf('.'));
    if (!EXTENSIONS.includes(ext)) { setError('Formato não suportado. Envie um arquivo .xls, .xlsx ou .csv.'); return; }
    if (selected.size > MAX_MB * 1024 * 1024) { setError(`O arquivo excede o limite de ${MAX_MB} MB.`); return; }
    if (selected.size === 0) { setError('O arquivo está vazio.'); return; }

    setFile(selected);
    setBusy('preview');
    try {
      const res = await api.post('/companies/import/preview', buildForm(selected, false), { headers: { 'Content-Type': 'multipart/form-data' } });
      const data: PreviewData = res.data.data;
      setPreview(data);
      setMapping(data.suggestedMapping || {});
    } catch (err) {
      setError(apiError(err, 'Não foi possível ler o arquivo'));
      setFile(null);
    } finally {
      setBusy('');
    }
  };

  const missingRequired = preview ? preview.fields.filter((f) => f.required && !mapping[f.key]) : [];

  const handleAnalyze = async () => {
    if (!file) return;
    setBusy('analyze'); setError(''); setResult(null);
    try {
      const res = await api.post('/companies/import/analyze', buildForm(file, true), { headers: { 'Content-Type': 'multipart/form-data' } });
      setAnalysis(res.data.data);
      setDuplicateMode('skip');
    } catch (err) {
      setAnalysis(null);
      setError(apiError(err, 'Não foi possível validar o arquivo'));
    } finally {
      setBusy('');
    }
  };

  const handleImport = async () => {
    if (!file || !analysis) return;
    setBusy('import'); setError('');
    try {
      const fd = buildForm(file, true);
      fd.append('duplicateMode', duplicateMode);
      const res = await api.post('/companies/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setResult(res.data.data);
      setAnalysis(null);
      notify.success('Importação concluída', res.data.message);
    } catch (err) {
      setError(apiError(err, 'Erro na importação. Nenhum dado foi gravado.'));
    } finally {
      setBusy('');
    }
  };

  const s = analysis?.summary;
  const dupCount = s ? s.duplicatesInDatabase : 0;
  const importable = s ? s.newCount + (duplicateMode === 'update' ? dupCount : 0) : 0;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" aria-label="Voltar" onClick={() => navigate('/companies')}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl sm:text-3xl font-bold text-primary">Importar empresas</h1>
      </div>

      {error && <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="h-4 w-4 mt-0.5 shrink-0" /><span>{error}</span></div>}

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5" />1. Escolha o arquivo</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label htmlFor="import-file" className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input p-6 text-center hover:bg-secondary/60">
            <UploadCloud className="h-8 w-8 text-primary" />
            <span className="text-sm font-medium">{file ? file.name : 'Clique para selecionar uma planilha'}</span>
            <span className="text-xs text-muted-foreground">.xls, .xlsx ou .csv · até {MAX_MB} MB · não precisa converter para CSV</span>
          </label>
          <input ref={inputRef} id="import-file" type="file" accept=".xls,.xlsx,.csv" className="sr-only" onChange={handleFile} />
          {busy === 'preview' && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Lendo arquivo...</p>}
        </CardContent>
      </Card>

      {preview && (
        <Card>
          <CardHeader><CardTitle>2. Relacione as colunas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {preview.totalRows} linha(s) em <strong>{preview.fileName}</strong>
              {preview.sheetName ? ` (aba "${preview.sheetName}")` : ''}. As colunas foram associadas automaticamente quando possível; ajuste se necessário.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {preview.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label htmlFor={`map-${f.key}`} className="text-sm font-medium">{f.label}{f.required && ' *'}</label>
                  <select
                    id={`map-${f.key}`}
                    value={mapping[f.key] || ''}
                    onChange={(e) => { setMapping({ ...mapping, [f.key]: e.target.value }); setAnalysis(null); }}
                    className="h-10 w-full rounded-md border border-input bg-background px-2 text-sm"
                  >
                    <option value="">— não importar —</option>
                    {preview.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <div>
              <p className="text-sm font-medium mb-1">Prévia do arquivo (10 primeiras linhas)</p>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead><tr className="bg-secondary/60">{preview.headers.map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold whitespace-nowrap">{h}</th>)}</tr></thead>
                  <tbody>
                    {preview.sampleRows.map((row, i) => (
                      <tr key={i} className="border-t">{preview.headers.map((h) => <td key={h} className="px-2 py-1.5 max-w-[12rem] truncate">{String(row[h] ?? '')}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {missingRequired.length > 0 && <p className="text-sm text-destructive">Relacione a coluna obrigatória: {missingRequired.map((f) => f.label).join(', ')}.</p>}
            <Button onClick={handleAnalyze} disabled={busy !== '' || missingRequired.length > 0} className="w-full sm:w-auto">
              {busy === 'analyze' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Validando...</> : 'Validar e verificar duplicidades'}
            </Button>
          </CardContent>
        </Card>
      )}

      {analysis && s && (
        <Card>
          <CardHeader><CardTitle>3. Confira e confirme</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ['Linhas', s.total, ''], ['Válidas', s.valid, 'text-success'], ['Inválidas', s.invalid, 'text-destructive'],
                ['Duplicadas', s.duplicatesInDatabase + s.duplicatesInFile, 'text-amber-600'],
              ].map(([label, value, color]) => (
                <div key={label as string} className="rounded-lg border p-3 text-center">
                  <p className={`text-2xl font-bold ${color}`}>{value as number}</p>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {s.newCount} nova(s) · {s.duplicatesInDatabase} já cadastrada(s) · {s.duplicatesInFile} repetida(s) no arquivo · {s.withoutDocument} sem CNPJ/CPF.
            </p>

            {dupCount > 0 && (
              <fieldset className="rounded-lg border p-3 space-y-2">
                <legend className="px-1 text-sm font-semibold text-primary">Empresas que já existem ({dupCount})</legend>
                <label className="flex items-start gap-2 text-sm"><input type="radio" name="dup" className="mt-1" checked={duplicateMode === 'skip'} onChange={() => setDuplicateMode('skip')} /><span><strong>Ignorar</strong> as duplicadas (mantém os dados atuais — recomendado)</span></label>
                <label className="flex items-start gap-2 text-sm"><input type="radio" name="dup" className="mt-1" checked={duplicateMode === 'update'} onChange={() => setDuplicateMode('update')} /><span><strong>Atualizar</strong> as existentes com os dados do arquivo (só campos preenchidos; células vazias não apagam dados)</span></label>
              </fieldset>
            )}

            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-xs">
                <thead><tr className="bg-secondary/60"><th className="px-2 py-1.5 text-left">Linha</th><th className="px-2 py-1.5 text-left">Situação</th><th className="px-2 py-1.5 text-left">Nome</th><th className="px-2 py-1.5 text-left">CNPJ/CPF</th><th className="px-2 py-1.5 text-left">Cidade</th></tr></thead>
                <tbody>
                  {analysis.previewRows.map((r) => (
                    <tr key={r.row} className="border-t"><td className="px-2 py-1.5">{r.row}</td>
                      <td className="px-2 py-1.5"><span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[r.status] || ''}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                      <td className="px-2 py-1.5 max-w-[14rem] truncate">{r.name}</td><td className="px-2 py-1.5 whitespace-nowrap">{r.document}</td><td className="px-2 py-1.5">{r.city}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>

            {analysis.issues.length > 0 && (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                <p className="text-sm font-semibold text-destructive mb-1">Linhas com erro (não serão importadas)</p>
                <ul className="max-h-40 overflow-y-auto text-xs space-y-0.5">{analysis.issues.map((r) => <li key={r.row}>Linha {r.row}: {r.errors.join('; ')}</li>)}</ul>
              </div>
            )}
            {analysis.duplicates.length > 0 && (
              <div className="rounded-md border p-3">
                <p className="text-sm font-semibold mb-1">Duplicidades encontradas</p>
                <ul className="max-h-40 overflow-y-auto text-xs space-y-0.5">{analysis.duplicates.map((r) => <li key={r.row}>Linha {r.row}: {r.name} ({r.document}) — {r.status === 'duplicate_in_file' ? 'repetida no arquivo' : `já cadastrada como "${r.existingName}"`}</li>)}</ul>
              </div>
            )}

            <Button onClick={handleImport} disabled={busy !== '' || importable === 0} className="w-full sm:w-auto">
              {busy === 'import' ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Importando...</> : `Importar ${importable} empresa(s)`}
            </Button>
            {importable === 0 && <p className="text-sm text-muted-foreground">Não há registros a importar com as opções atuais.</p>}
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className="border-success/40">
          <CardHeader><CardTitle className="flex items-center gap-2 text-success"><CheckCircle2 className="h-5 w-5" />Importação concluída</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[['Importadas', result.added], ['Atualizadas', result.updated], ['Ignoradas', result.ignored], ['Rejeitadas', result.rejected]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border p-3 text-center"><p className="text-2xl font-bold">{v as number}</p><p className="text-xs text-muted-foreground">{l}</p></div>
              ))}
            </div>
            {result.errors.length > 0 && <ul className="max-h-40 overflow-y-auto rounded bg-destructive/5 p-2 text-xs text-destructive space-y-0.5">{result.errors.map((e, i) => <li key={i}>Linha {e.row}: {e.message}</li>)}</ul>}
            {result.ignoredRows.length > 0 && <ul className="max-h-40 overflow-y-auto rounded bg-secondary/60 p-2 text-xs space-y-0.5">{result.ignoredRows.map((e, i) => <li key={i}>Linha {e.row} ({e.document}): {e.reason}</li>)}</ul>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => navigate('/companies')}>Ver empresas</Button>
              <Button variant="outline" onClick={reset}>Importar outro arquivo</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
