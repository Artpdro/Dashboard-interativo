import { Request, Response } from 'express';
export declare const SmtpConfigController: {
    list: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    create: (req: Request, res: Response, next: import("express").NextFunction) => void;
    update: (req: Request, res: Response, next: import("express").NextFunction) => void;
    delete: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /** Testa uma configuração já salva (opcionalmente enviando uma mensagem de teste para `to`). */
    test: (req: Request, res: Response, next: import("express").NextFunction) => void;
    /**
     * Testa os dados digitados no formulário ANTES de salvar.
     * Se `id` for enviado e a senha vier vazia, usa a senha já salva dessa configuração.
     */
    testDraft: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=smtpConfigController.d.ts.map