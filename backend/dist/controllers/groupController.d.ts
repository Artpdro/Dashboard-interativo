import { Request, Response } from 'express';
export declare const GroupController: {
    list: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    create: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Edita dados do grupo e, opcionalmente, as empresas associadas:
     *  - addCompanyIds / removeCompanyIds: alterações incrementais (preserva todo o resto);
     *  - companyIds: lista completa desejada (sincroniza adicionando/removendo só a diferença).
     * Campos não enviados não são alterados.
     */
    update: (req: Request, res: Response, next: import("express").NextFunction) => void;
    delete: (req: Request, res: Response, next: import("express").NextFunction) => void;
    addCompanies: (req: Request, res: Response, next: import("express").NextFunction) => void;
    removeCompany: (req: Request, res: Response, next: import("express").NextFunction) => void;
    addByFilter: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Pesquisa de empresas para montar/editar grupos.
     * Filtros combináveis: name, document (CNPJ com ou sem pontuação), city, neighborhood.
     * Sem nenhum filtro devolve lista vazia (não carrega todas as empresas à toa).
     */
    searchCompanies: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=groupController.d.ts.map