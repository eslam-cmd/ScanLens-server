"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HeadersEngine = void 0;
// server/src/scanner/engines/headers.engine.ts
const common_1 = require("@nestjs/common");
let HeadersEngine = class HeadersEngine {
    analyze(headers) {
        console.log('🔍 HeadersEngine.analyze() called');
        console.log('🔍 Headers received:', Object.keys(headers));
        const securityHeaders = [
            'content-security-policy',
            'strict-transport-security',
            'x-content-type-options',
            'x-frame-options',
            'referrer-policy',
            'permissions-policy',
        ];
        const presentHeaders = [];
        const missingHeaders = [];
        for (const header of securityHeaders) {
            const found = Object.keys(headers).some((key) => key.toLowerCase() === header);
            if (found) {
                presentHeaders.push(header);
            }
            else {
                missingHeaders.push(header);
            }
        }
        console.log('🔍 Present Headers:', presentHeaders);
        console.log('🔍 Missing Headers:', missingHeaders);
        return { presentHeaders, missingHeaders };
    }
};
exports.HeadersEngine = HeadersEngine;
exports.HeadersEngine = HeadersEngine = __decorate([
    (0, common_1.Injectable)()
], HeadersEngine);
