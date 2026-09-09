"use strict";
// server/src/scheduler/scheduler.controller.ts
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchedulerController = void 0;
const common_1 = require("@nestjs/common");
const scheduler_service_1 = require("./scheduler.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_guard_1 = require("../auth/guards/admin.guard");
let SchedulerController = class SchedulerController {
    schedulerService;
    constructor(schedulerService) {
        this.schedulerService = schedulerService;
    }
    async runDailyLicense() {
        await this.schedulerService.handleDailyLicenseTasks();
        return { message: 'Daily license tasks completed' };
    }
    async runDailySubscription() {
        await this.schedulerService.handleDailySubscriptionTasks();
        return { message: 'Daily subscription tasks completed' };
    }
    async runHourly() {
        await this.schedulerService.handleHourlyTasks();
        return { message: 'Hourly tasks completed' };
    }
    async runWeekly() {
        await this.schedulerService.handleWeeklyTasks();
        return { message: 'Weekly tasks completed' };
    }
    async runMonthly() {
        await this.schedulerService.handleMonthlyTasks();
        return { message: 'Monthly tasks completed' };
    }
};
exports.SchedulerController = SchedulerController;
__decorate([
    (0, common_1.Get)('run-daily-license'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerController.prototype, "runDailyLicense", null);
__decorate([
    (0, common_1.Get)('run-daily-subscription'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerController.prototype, "runDailySubscription", null);
__decorate([
    (0, common_1.Get)('run-hourly'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerController.prototype, "runHourly", null);
__decorate([
    (0, common_1.Get)('run-weekly'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerController.prototype, "runWeekly", null);
__decorate([
    (0, common_1.Get)('run-monthly'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SchedulerController.prototype, "runMonthly", null);
exports.SchedulerController = SchedulerController = __decorate([
    (0, common_1.Controller)('scheduler'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [scheduler_service_1.SchedulerService])
], SchedulerController);
