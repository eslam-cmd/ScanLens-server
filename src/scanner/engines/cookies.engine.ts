import { Injectable } from '@nestjs/common';

export interface CookieDetail {
  name: string;
  hasSecure: boolean;
  hasHttpOnly: boolean;
  sameSite: string | null;
}

@Injectable()
export class CookiesEngine {
  analyze(setCookieHeader?: string | string[]): CookieDetail[] {
    if (!setCookieHeader) return [];

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

      let sameSite: string | null = null;
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
}
