import { Request, Response } from 'express';
export declare const EmailCampaignController: {
    list: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getById: (req: Request, res: Response, next: import("express").NextFunction) => void;
    create: (req: Request, res: Response, next: import("express").NextFunction) => void;
    send: (req: Request, res: Response, next: import("express").NextFunction) => void;
    pause: (req: Request, res: Response, next: import("express").NextFunction) => void;
    cancel: (req: Request, res: Response, next: import("express").NextFunction) => void;
    delete: (req: Request, res: Response, next: import("express").NextFunction) => void;
    preview: (req: Request, res: Response, next: import("express").NextFunction) => void;
    sendSingle: (req: Request, res: Response, next: import("express").NextFunction) => void;
    getHistory: (req: Request, res: Response, next: import("express").NextFunction) => void;
    uploadAttachment: (req: Request, res: Response, next: import("express").NextFunction) => void;
    deleteAttachment: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=emailCampaignController.d.ts.map