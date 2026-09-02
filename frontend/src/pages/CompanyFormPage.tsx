import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Building2 } from 'lucide-react';

export default function CompanyFormPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({
    name: '', email: '', additionalEmails: '', phone: '', companyName: '', document: '',
    landline: '', street: '', number: '', complement: '', neighborhood: '', city: '',
    zipCode: '', state: '', overdueAmount: '', paidAmount: '', dueAmount: '',
  });

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...formData,
        overdueAmount: formData.overdueAmount ? parseFloat(formData.overdueAmount.replace(/[R$\s.]/g, '').replace(',', '.')) : 0,
        paidAmount: formData.paidAmount ? parseFloat(formData.paidAmount.replace(/[R$\s.]/g, '').replace(',', '.')) : 0,
        dueAmount: formData.dueAmount ? parseFloat(formData.dueAmount.replace(/[R$\s.]/g, '').replace(',', '.')) : 0,
      };
      await api.post('/companies', payload);
      alert('Empresa criada com sucesso!');
      navigate('/companies');
    } catch (e: any) {
      alert(e.response?.data?.message || 'Erro ao criar empresa');
    } finally {
      setLoading(false);
    }
  };

  const fields = [
    { key: 'name', label: 'Nome *', type: 'text', required: true },
    { key: 'email', label: 'E-mail', type: 'email' },
    { key: 'additionalEmails', label: 'E-mails Adicionais', type: 'text' },
    { key: 'phone', label: 'Celular', type: 'text' },
    { key: 'companyName', label: 'Empresa / Nome Fantasia', type: 'text' },
    { key: 'document', label: 'CPF / CNPJ', type: 'text' },
    { key: 'landline', label: 'Fone Fixo', type: 'text' },
    { key: 'street', label: 'Rua', type: 'text' },
    { key: 'number', label: 'Número', type: 'text' },
    { key: 'complement', label: 'Complemento', type: 'text' },
    { key: 'neighborhood', label: 'Bairro', type: 'text' },
    { key: 'city', label: 'Cidade', type: 'text' },
    { key: 'zipCode', label: 'CEP', type: 'text' },
    { key: 'state', label: 'Estado', type: 'text' },
    { key: 'overdueAmount', label: 'Valor Vencido', type: 'number' },
    { key: 'paidAmount', label: 'Valor Pago', type: 'number' },
    { key: 'dueAmount', label: 'Valor a Vencer', type: 'number' },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/companies')}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-3xl font-bold">Nova Empresa</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-primary" />Dados da Empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-sm font-medium">{f.label}</label>
                  <Input type={f.type} value={formData[f.key]} onChange={(e) => handleChange(f.key, e.target.value)} required={f.required} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" type="button" onClick={() => navigate('/companies')}>Cancelar</Button>
              <Button type="submit" disabled={loading}>{loading ? 'Salvando...' : 'Salvar Empresa'}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
