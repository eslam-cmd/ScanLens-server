// server/src/scanner/engines.module.ts (بدلاً من scanner.module.ts)
import { Module } from '@nestjs/common';
import { HeadersEngine } from './engines/headers.engine';
import { CookiesEngine } from './engines/cookies.engine';
import { HttpsEngine } from './engines/https.engine';

@Module({
  providers: [HeadersEngine, CookiesEngine, HttpsEngine],
  exports: [HeadersEngine, CookiesEngine, HttpsEngine],
})
export class EnginesModule {}
