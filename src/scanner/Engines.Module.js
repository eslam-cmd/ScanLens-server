"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnginesModule = void 0;
// server/src/scanner/engines.module.ts (بدلاً من scanner.module.ts)
const common_1 = require("@nestjs/common");
const headers_engine_1 = require("./engines/headers.engine");
const cookies_engine_1 = require("./engines/cookies.engine");
const https_engine_1 = require("./engines/https.engine");
let EnginesModule = class EnginesModule {
};
exports.EnginesModule = EnginesModule;
exports.EnginesModule = EnginesModule = __decorate([
    (0, common_1.Module)({
        providers: [headers_engine_1.HeadersEngine, cookies_engine_1.CookiesEngine, https_engine_1.HttpsEngine],
        exports: [headers_engine_1.HeadersEngine, cookies_engine_1.CookiesEngine, https_engine_1.HttpsEngine],
    })
], EnginesModule);
