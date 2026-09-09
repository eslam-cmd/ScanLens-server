"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerifiedGuard = void 0;
// server/src/auth/guards/verified.guard.ts
const common_1 = require("@nestjs/common");
let VerifiedGuard = class VerifiedGuard {
    canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        if (!user) {
            throw new common_1.UnauthorizedException('User not authenticated');
        }
        if (!user.isVerified) {
            throw new common_1.UnauthorizedException('Account not verified. Please verify your email first.');
        }
        return true;
    }
};
exports.VerifiedGuard = VerifiedGuard;
exports.VerifiedGuard = VerifiedGuard = __decorate([
    (0, common_1.Injectable)()
], VerifiedGuard);
