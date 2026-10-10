# CRM Enterprise

Sistema completo de gerenciamento de empresas com comunicação em massa via e-mail.
## Correções Aplicadas

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

## Tecnologias

- **Backend:** Node.js, Express, TypeScript, Prisma, PostgreSQL, Nodemailer, JWT, Winston
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Radix UI, Recharts, Zustand, Axios

## Uso local no Windows (sem VS Code)

1. Instale o **Node.js LTS** (https://nodejs.org) e o **PostgreSQL**.
2. Dê dois cliques em **`Instalar CRM.bat`** (só na primeira vez). Ele pede os dados do PostgreSQL, cria o banco, as tabelas, o admin, compila o sistema e cria o atalho **CRM Enterprise** na área de trabalho.
3. Para usar: abra o atalho **CRM Enterprise**. O servidor sobe e o navegador abre em `http://localhost:3001`. Mantenha a janela aberta enquanto usa; feche-a para encerrar.

Login inicial: `admin@crm.com` / `admin123`.

## Editor de e-mail

Templates, campanhas e envio individual usam um editor com negrito, itálico, sublinhado, riscado, fonte, tamanho, cores, alinhamento, listas, links e variáveis (`{{nome}}` etc.).
