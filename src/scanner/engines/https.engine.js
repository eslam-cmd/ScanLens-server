"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpsEngine = void 0;
const common_1 = require("@nestjs/common");
let HttpsEngine = class HttpsEngine {
    async checkHttps(targetUrl) {
        try {
            const url = new URL(targetUrl);
            const isHttps = url.protocol === 'https:';
            return {
                isHttps,
                protocol: url.protocol,
                hostname: url.hostname,
            };
        }
        catch {
            return {
                isHttps: false,
                protocol: 'unknown',
                hostname: targetUrl,
            };
        }
    }
};
exports.HttpsEngine = HttpsEngine;
exports.HttpsEngine = HttpsEngine = __decorate([
    (0, common_1.Injectable)()
], HttpsEngine);
