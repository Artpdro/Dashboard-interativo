import { useEffect, useState } from 'react';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, History } from 'lucide-react';

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadLogs(); }, []);

  const loadLogs = async () => {
    try { const res = await api.get('/audit'); setLogs(res.data.data); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleExport = () => { window.open('/api/audit/export', '_blank'); };

  if (loading) return <div>Carregando...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold flex items-center gap-2"><History className="h-6 w-6" />Auditoria</h1>
        <Button variant="outline" onClick={handleExport}><Download className="h-4 w-4 mr-2" />Exportar CSV</Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow><TableHead>Data</TableHead><TableHead>Usuário</TableHead><TableHead>Ação</TableHead><TableHead>Entidade</TableHead><TableHead>Detalhes</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.createdAt).toLocaleString('pt-BR')}</TableCell>
                  <TableCell>{log.user?.name || 'Sistema'}</TableCell>
                  <TableCell>{log.action}</TableCell>
                  <TableCell>{log.entity}</TableCell>
                  <TableCell className="max-w-xs truncate">{log.details ? JSON.stringify(log.details) : '-'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
