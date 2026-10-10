# Relatório de alterações — CRM Enterprise (Sindnorte)

Base utilizada: repositório `Artpdro/Dashboard-interativo` (o ZIP citado no prompt não chegou à sessão; não houve comparação ZIP × repositório).

## Causas encontradas e correções

| # | Problema | Causa | Correção |
|---|----------|-------|----------|
| 1 | Cadastro/edição de empresas | Dados sem normalização/validação; CNPJ salvo com máscara; reenvio do objeto inteiro na edição | `sanitizeCompanyInput` único (cadastro, edição e importação); só campos conhecidos; CNPJ/CPF salvo só com dígitos e validado (dígitos verificadores); duplicidade por CNPJ normalizado (409 com mensagem clara); mensagens de erro/sucesso na tela |
| 2 | Aba SMTP "sumida" | A rota `/smtp` existia, mas **não havia item no menu lateral** | Item "Configuração SMTP" no menu (administradores); página reescrita |
| 3 | SMTP | Senha em texto puro, remetente fixo no código, sem teste antes de salvar | Senha criptografada (AES-256-GCM), nunca devolvida pela API; campos servidor/porta/usuário/senha/segurança/remetente (e-mail e nome); teste antes de salvar e das configs salvas; envios usam a config salva (escolhida → padrão → ativa) |
| 4 | Pesquisa de grupos | Só busca simples por texto | Filtros nome/CNPJ/cidade/bairro combináveis, paginados no servidor, sem acento/maiúsculas/espaços extras |
| 5 | Pesquisa por CNPJ | Comparação literal | Comparação só por dígitos (com ou sem pontuação), inclusive para registros antigos mascarados |
| 6 | Envio individual | Falhava sem config/validação adequada e confirmava sem aceite do servidor | Usa a mesma config SMTP; valida e-mail; só informa sucesso após o servidor aceitar; falha registrada no histórico com a mensagem do SMTP; proteção contra clique duplo |
| 7 | Edição de grupos | Edição não carregava nem alterava empresas | Carrega associadas; envia só a diferença (add/remove); sem duplicidade (`skipDuplicates` + unique); nada mais é apagado |
| 8 | Sidebar de selecionadas | Inexistente | Nome + CNPJ, contador, remoção direta, preserva seleção entre pesquisas, painel recolhível no celular |
| 9 | Importação | Só CSV, sem mapeamento/validação | `.xls`, `.xlsx` e `.csv` (`;`/`,`, UTF-8/Latin-1) detectados pelo conteúdo; prévia; mapeamento de colunas; validação; duplicidades (no banco e no arquivo); ignorar ou atualizar (escolha explícita, células vazias nunca apagam dados); transação única; resumo |
| 10 | Design | Tema azul genérico | Tema institucional centralizado em variáveis CSS (`frontend/src/index.css`), menu lateral, botões, tabelas, formulários padronizados |
| 11 | Responsividade | Menu fixo e tabelas largas | Menu em gaveta no celular, diálogos e formulários adaptáveis |

## Arquivos modificados
**Backend:** `package.json`, `package-lock.json`, `prisma/schema.prisma`, `src/controllers/{company,emailCampaign,group,smtpConfig}Controller.ts`, `src/routes/{company,group,smtpConfig}Routes.ts`, `src/types/index.ts`, `src/utils/errorHandler.ts`
**Backend (novos):** `.env.example`, `src/utils/{companyData,companyImport,companySearch,document,emailSender,money,secrets,spreadsheet}.ts`, migrações `20261009120000_smtp_from_name` e `20261009120100_normalize_company_documents`
**Frontend:** `index.css`, `tailwind.config.js`, `types/index.ts`, `components/layout/{Header,Layout,Sidebar}.tsx`, `components/ui/{button,card,dialog,table}.tsx`, `pages/{Companies,CompanyDetail,CompanyForm,Groups,Import,SmtpConfig}Page.tsx`
**Frontend (novos):** `lib/format.ts`, `lib/notify.ts`

## Dependências
- Backend: `@e965/xlsx` (leitura de .xls/.xlsx). Nenhuma outra. Frontend: nenhuma.

## Migrações (não destrutivas)
1. `smtp_from_name`: adiciona a coluna opcional `from_name` em `smtp_configs`.
2. `normalize_company_documents`: grava só os dígitos do CNPJ/CPF. Não apaga empresas nem altera relações. Se duas empresas tiverem o mesmo documento em formatos diferentes, só uma é padronizada e a outra permanece como está para revisão manual (nunca viola a unicidade).

Aplicar: `cd backend && npx prisma migrate deploy && npx prisma generate`.
Senhas SMTP já salvas em texto puro continuam funcionando e passam a ser criptografadas quando a configuração for salva novamente.

## Testes realizados
| Teste | Resultado |
|-------|-----------|
| `tsc` backend e frontend + build Vite (do zero) | OK, sem erros |
| Migrações SQL em PostgreSQL 16 vazio | OK |
| Migração de CNPJ com dados legados (máscara, duplicado, só pontuação, nulo) | OK: nada apagado, duplicados preservados |
| Busca SQL: CNPJ com/sem pontuação, acentos/maiúsculas, cidade+bairro | OK |
| Importação: `.xlsx`, `.xls`, `.csv` (`;` Latin-1 e `,` UTF-8 com BOM): CNPJ com máscara/numérico, CEP sem zero, e-mails múltiplos, CNPJ inválido, sem nome, e-mail inválido (43 verificações) | OK |
| Arquivos inválidos: vazio, só cabeçalho, binário, extensão errada, XLSX corrompido, texto como .xlsx | Rejeitados com mensagem |
| SMTP contra servidor local de teste: login ok, senha errada, destinatário recusado (não vira sucesso), servidor fora do ar, lote com falha parcial | OK (7/7); um defeito achado e corrigido (servidor fora do ar era descrito como "tempo esgotado") |
| Interface em navegador (desktop e celular, API simulada): filtros combinados, CNPJ mascarado, seleção preservada, contador, remoção pela sidebar, diff enviado no PUT, SMTP no menu, senha não exposta, sem rolagem horizontal | OK (23/23) |

## NÃO foi possível testar neste ambiente
O Prisma não conseguiu baixar seus binários (acesso bloqueado), então **a API completa não foi executada contra o banco**. Ficam sem teste de ponta a ponta: cadastro/edição via API, persistência após reiniciar, criação/edição de grupos via API, envio individual e em lote via API, e autenticação/permissões das rotas. Foram validados por compilação e revisão de código. Recomenda-se rodar o roteiro abaixo uma vez após instalar.

**Roteiro de verificação rápida:** (1) cadastrar empresa com CNPJ `11.222.333/0001-81` e tentar de novo com `11222333000181` → deve recusar duplicidade; (2) pesquisar nos dois formatos; (3) criar grupo, editar, adicionar/remover; (4) importar uma planilha; (5) em SMTP, testar e enviar um e-mail para uma empresa; (6) enviar uma campanha para um grupo pequeno.

## Observações
- **Identidade visual:** o site sindnorte.com.br não pôde ser consultado nesta sessão. A paleta (azul-marinho + dourado) é uma aproximação; para ajustar às cores oficiais basta editar as variáveis `--primary`, `--accent` e `--sidebar` em `frontend/src/index.css`.
- O ZIP **não** inclui `.env`, `node_modules`, logs nem os anexos de campanhas existentes (`backend/uploads`).
