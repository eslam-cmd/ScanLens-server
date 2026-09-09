"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CookiesEngine = void 0;
const common_1 = require("@nestjs/common");
let CookiesEngine = class CookiesEngine {
    analyze(setCookieHeader) {
        if (!setCookieHeader)
            return [];
        const cookieStrings = Array.isArray(setCookieHeader)
            ? setCookieHeader
            : [setCookieHeader];
        return cookieStrings.map((cookieStr) => {
            const parts = cookieStr.split(';').map((p) => p.trim());
            const [nameValue] = parts;
            const name = nameValue.split('=')[0];
            const lowerParts = parts.map((p) => p.toLowerCase());
            const hasSecure = lowerParts.includes('secure');
            const hasHttpOnly = lowerParts.includes('httponly');
            let sameSite = null;
            const sameSitePart = lowerParts.find((p) => p.startsWith('samesite='));
            if (sameSitePart) {
                sameSite = sameSitePart.split('=')[1];
            }
            return {
                name,
                hasSecure,
                hasHttpOnly,
                sameSite,
            };
        });
    }
};
exports.CookiesEngine = CookiesEngine;
exports.CookiesEngine = CookiesEngine = __decorate([
    (0, common_1.Injectable)()
], CookiesEngine);
