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
npx prisma migrate deploy   # aplica as migrações (não destrutivas)
npx prisma generate
npm run db:seed
npm run dev                 # ou: npm run build && npm start
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

## Novidades

- **Importação** de empresas em `.xls`, `.xlsx` e `.csv` com prévia, mapeamento de colunas, validação, tratamento de duplicados (ignorar ou atualizar) e resumo.
- **CNPJ** sempre salvo e pesquisado só com dígitos (aceita `12.345.678/0001-90` ou `12345678000190`).
- **Grupos**: filtros por nome/CNPJ/cidade/bairro, edição de empresas do grupo e sidebar de selecionadas.
- **SMTP** (menu "Configuração SMTP", administradores): senha criptografada, teste de conexão antes de salvar.
- Veja `RELATORIO.md` para o detalhamento e os testes.

## Editor de e-mail

Templates, campanhas e envio individual usam um editor com negrito, itálico, sublinhado, riscado, fonte, tamanho, cores, alinhamento, listas, links e variáveis (`{{nome}}` etc.).
