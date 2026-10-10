/** Mantém só os dígitos (mesma regra do backend para CNPJ/CPF). */
export const onlyDigits = (value: string | null | undefined): string => (value ?? '').replace(/\D/g, '');

/** Máscara de exibição de CNPJ (14 dígitos) ou CPF (11). Outros valores são devolvidos como estão. */
export function formatDocument(value: string | null | undefined): string {
  const d = onlyDigits(value);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return value ?? '';
}

/** Extrai a mensagem de erro devolvida pela API (ou uma mensagem padrão). */
export function apiError(error: unknown, fallback = 'Não foi possível concluir a operação'): string {
  const e = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
  return e?.response?.data?.message || e?.response?.data?.error || (e?.message === 'Network Error' ? 'Sem conexão com o servidor' : fallback);
}
