import { Injectable } from '@nestjs/common';

@Injectable()
export class HttpsEngine {
  async checkHttps(targetUrl: string) {
    try {
      const url = new URL(targetUrl);
      const isHttps = url.protocol === 'https:';

      return {
        isHttps,
        protocol: url.protocol,
        hostname: url.hostname,
      };
    } catch {
      return {
        isHttps: false,
        protocol: 'unknown',
        hostname: targetUrl,
      };
    }
  }
}
