import { Request, Response } from 'express';
export declare const AuthController: {
    login: (req: Request, res: Response, next: import("express").NextFunction) => void;
    register: (req: Request, res: Response, next: import("express").NextFunction) => void;
    me: (req: Request, res: Response, next: import("express").NextFunction) => void;
    listUsers: (req: Request, res: Response, next: import("express").NextFunction) => void;
    updateUser: (req: Request, res: Response, next: import("express").NextFunction) => void;
    deleteUser: (req: Request, res: Response, next: import("express").NextFunction) => void;
};
//# sourceMappingURL=authController.d.ts.map