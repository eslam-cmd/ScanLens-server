// server/src/scanner/engines/headers.engine.ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class HeadersEngine {
  analyze(headers: Record<string, string>) {
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

    const presentHeaders: string[] = [];
    const missingHeaders: string[] = [];

    for (const header of securityHeaders) {
      const found = Object.keys(headers).some(
        (key) => key.toLowerCase() === header,
      );
      if (found) {
        presentHeaders.push(header);
      } else {
        missingHeaders.push(header);
      }
    }

    console.log('🔍 Present Headers:', presentHeaders);
    console.log('🔍 Missing Headers:', missingHeaders);

    return { presentHeaders, missingHeaders };
  }
}
