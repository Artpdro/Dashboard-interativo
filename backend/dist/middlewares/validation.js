"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validate = void 0;
const express_validator_1 = require("express-validator");
const errorHandler_1 = require("../utils/errorHandler");
const validate = (req, res, next) => {
    const errors = (0, express_validator_1.validationResult)(req);
    if (!errors.isEmpty()) {
        throw new errorHandler_1.AppError('Dados inválidos: ' + errors.array().map(e => e.msg).join(', '), 400, 'VALIDATION_ERROR');
    }
    next();
};
exports.validate = validate;
//# sourceMappingURL=validation.js.map