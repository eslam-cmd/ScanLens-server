// server/src/admin/admin.module.ts
import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { AuthModule } from 'src/auth/auth.module';
import { AdminPaymentsController } from './admin-payments.controller';

@Module({
  imports: [PrismaModule,AuthModule],
  controllers: [AdminController,AdminPaymentsController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
