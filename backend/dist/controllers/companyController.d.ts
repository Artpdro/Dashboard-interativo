import { Request, Response } from 'express';
export declare const CompanyController: {
    list: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    create: (req: Request, res: Response, next: import("express").NextFunction) => void;
    update: (req: Request, res: Response, next: import("express").NextFunction) => void;
    delete: (req: Request, res: Response, next: import("express").NextFunction) => void;
    deleteMany: (req: Request, res: Response, next: import("express").NextFunction) => void;
    importCsv: (req: Request, res: Response, next: import("express").NextFunction) => void;
    exportCsv: (req: Request, res: Response, next: import("express").NextFunction) => void;
    previewCsv: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getStats: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=companyController.d.ts.map