import { Request, Response } from 'express';
export declare const CompanyController: {
    list: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    create: (req: Request, res: Response, next: import("express").NextFunction) => void;
    update: (req: Request, res: Response, next: import("express").NextFunction) => void;
    delete: (req: Request, res: Response, next: import("express").NextFunction) => void;
    deleteMany: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /** Etapa 1: lê o arquivo, devolve colunas, amostra e o mapeamento sugerido. Nada é gravado. */
    importPreview: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /** Etapa 2: valida todas as linhas com o mapeamento escolhido e aponta duplicidades. Nada é gravado. */
    importAnalyze: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /** Etapa 3: grava em uma única transação. Duplicados: 'skip' (padrão) ou 'update' (escolha explícita). */
    importExecute: (req: Request, res: Response, next: import("express").NextFunction) => void;
    exportCsv: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=companyController.d.ts.map