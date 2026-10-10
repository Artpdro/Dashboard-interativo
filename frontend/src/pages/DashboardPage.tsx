import { useEffect, useState } from 'react';
import api from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DashboardStats } from '@/types';
import { Building2, Users, Mail, Send, Clock, AlertCircle, DollarSign, CheckCircle } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1', '#14B8A6', '#A855F7'];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    try { const response = await api.get('/companies/stats'); setStats(response.data.data); }
    catch (error) { console.error(error); } finally { setLoading(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64">Carregando...</div>;

  const statCards = [
    { title: 'Total de Empresas', value: stats?.totalCompanies, icon: Building2, color: 'text-blue-500' },
    { title: 'Grupos', value: stats?.totalGroups, icon: Users, color: 'text-purple-500' },
    { title: 'Campanhas', value: stats?.totalCampaigns, icon: Mail, color: 'text-green-500' },
    { title: 'E-mails Enviados', value: stats?.totalEmailsSent, icon: Send, color: 'text-cyan-500' },
    { title: 'Pendentes', value: stats?.totalEmailsPending, icon: Clock, color: 'text-yellow-500' },
    { title: 'Com Erro', value: stats?.totalEmailsFailed, icon: AlertCircle, color: 'text-red-500' },
    { title: 'Valor Vencido', value: `R$ ${Number(stats?.totalOverdue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: DollarSign, color: 'text-red-600' },
    { title: 'Valor Pago', value: `R$ ${Number(stats?.totalPaid || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, icon: CheckCircle, color: 'text-green-600' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold mt-1">{card.value ?? 0}</p>
                </div>
                <card.icon className={`h-8 w-8 ${card.color}`} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="text-lg">Empresas por Grupo</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={stats?.byGroup || []} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="count" nameKey="name">
                  {(stats?.byGroup || []).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color || COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-lg">Empresas por Município (Top 15)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={stats?.byCity || []} cx="50%" cy="50%" outerRadius={100} paddingAngle={2} dataKey="count" nameKey="city" label={({ city, count }) => `${city}: ${count}`}>
                  {(stats?.byCity || []).map((_entry, index) => (
                    <Cell key={`city-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
