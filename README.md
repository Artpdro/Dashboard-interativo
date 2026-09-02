# CRM Enterprise

Sistema completo de gerenciamento de empresas com comunicação em massa via e-mail.

## Funcionalidades

- **Cadastro de Empresas** com dados completos (endereço, contato, financeiro)
- **Grupos** para segmentação de empresas
- **Templates de E-mail** com variáveis dinâmicas e **assinaturas**
- **Campanhas de E-mail** em massa com **anexos** (PDF, imagens, Word, Excel)
- **Importação/Exportação CSV** de empresas
- **Dashboard** com estatísticas e gráficos
- **Auditoria** completa de ações
- **Autenticação** com JWT (Admin e Operador)
- **Configuração SMTP** múltipla

## Correções Aplicadas

1. ✅ **Adicionar Empresa** - Criada página `CompanyFormPage` com formulário completo
2. ✅ **Removido gráfico de Estados** do Dashboard
3. ✅ **Envio de E-mail corrigido** - `createTransport` (era `createTransporter`)
4. ✅ **Assinaturas** em templates e campanhas
5. ✅ **Anexos** em campanhas (upload de arquivos)
6. ✅ **E-mail fixo**: `sindnorteigarassu2019@hotmail.com`

## Estrutura

```
crm-enterprise/
├── backend/          # API Node.js + Express + Prisma + PostgreSQL
│   ├── src/
│   │   ├── controllers/     # Lógica de negócio
│   │   ├── routes/          # Rotas da API
│   │   ├── middlewares/     # Auth e validação
│   │   ├── utils/           # DB, logger, audit, errorHandler
│   │   └── types/           # Tipagens TypeScript
│   ├── prisma/
│   │   └── schema.prisma    # Modelo do banco (atualizado)
│   └── package.json
│
└── frontend/       # React + Vite + Tailwind + Recharts
    ├── src/
    │   ├── pages/           # Todas as páginas
    │   ├── components/ui/   # Componentes reutilizáveis
    │   ├── components/layout/ # Sidebar, Header, Layout
    │   ├── hooks/           # useAuth (Zustand)
    │   ├── services/        # API client (Axios)
    │   └── types/           # Tipagens TypeScript
    └── package.json
```

## Como rodar

### Backend

```bash
cd backend
cp .env.example .env
# Edite .env com sua DATABASE_URL e JWT_SECRET
npm install
npx prisma migrate dev --name init
npx prisma generate
npm run db:seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Acesse `http://localhost:5173`

**Login padrão:** `admin@crm.com` / `admin123`

## Variáveis de Ambiente (.env)

```env
DATABASE_URL="postgresql://user:password@localhost:5432/crm_enterprise?schema=public"
JWT_SECRET="sua-chave-secreta-aqui-minimo-32-caracteres"
JWT_EXPIRES_IN="7d"
PORT=3001
NODE_ENV=development
DEFAULT_FROM_EMAIL="sindnorteigarassu2019@hotmail.com"
```

## Tecnologias

- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL, Nodemailer, JWT, Winston
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts, Zustand, Axios
