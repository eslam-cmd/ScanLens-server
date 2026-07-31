// server/src/ai/ai.service.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private ai: GoogleGenAI;
  private readonly logger = new Logger(AiService.name);

  constructor(private configService: ConfigService) {
    this.ai = new GoogleGenAI({
      apiKey: this.configService.get('GEMINI_API_KEY') || '',
    });
  }

  /**
   * توليد حل برمجي وتوصية أمنية معالجة بناءً على الثغرة ونوع الإطار البرمجي
   */
  async generateRemediation(
    vulnerabilityTitle: string,
    description: string,
    context?: string,
  ): Promise<string> {
    // ✅ تحديد نوع الإطار البرمجي من السياق
    const framework = this.detectFramework(context || description);

    // ✅ استخدام Gemini AI لتوليد إصلاح دقيق
    try {
      const prompt = this.buildPrompt(
        vulnerabilityTitle,
        description,
        context,
        framework,
      );

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.0-flash-exp',
        contents: prompt,
        config: {
          temperature: 0.3,
          topP: 0.8,
          topK: 40,
          maxOutputTokens: 2048,
        },
      });

      const text = response.text || '';

      // ✅ إذا لم ينجح Gemini، استخدم الـ fallback
      if (!text || text.length < 50) {
        this.logger.warn('Gemini returned empty response, using fallback');
        return this.generateFallbackRemediation(
          vulnerabilityTitle,
          description,
          framework,
        );
      }

      return this.formatResponse(text);
    } catch (error) {
      this.logger.error('AI Generation Error:', error);
      // ✅ استخدم الـ fallback في حالة الخطأ
      return this.generateFallbackRemediation(
        vulnerabilityTitle,
        description,
        framework,
      );
    }
  }

  /**
   * ✅ بناء الـ Prompt المحسن
   */
  private buildPrompt(
    vulnerabilityTitle: string,
    description: string,
    context?: string,
    framework: string = 'Node.js/NestJS',
  ): string {
    return `
You are a Senior Security Engineer at a top-tier cybersecurity firm. 
Provide a comprehensive, actionable remediation guide for the following security vulnerability.

**Vulnerability:** ${vulnerabilityTitle}
**Description:** ${description}
${context ? `**Context:** ${context}` : ''}
**Framework:** ${framework}

Your response must be in MARKDOWN format with the following structure:

## 🔍 Risk Analysis
- Brief explanation of the vulnerability impact
- CVSS-like severity assessment (Critical/High/Medium/Low)
- Attack vector and potential consequences

## 🛡️ Recommended Fix
- Step-by-step implementation guide
- Best practices and security considerations
- Platform-specific recommendations for ${framework}

## 💻 Code Implementation
\`\`\`${this.getLanguage(framework)}
// ✅ Complete, production-ready code example
// ✅ Include security headers, validation, and error handling
// ✅ Add comments explaining each security measure
\`\`\`

## ✅ Verification Steps
- How to test the fix
- Tools to verify the solution
- Expected results after implementation

## 📚 Additional Resources
- Related security standards (OWASP, CWE)
- Further reading and references
`;
  }

  /**
   * ✅ تحديد الإطار البرمجي من السياق
   */
  private detectFramework(context: string): string {
    const frameworks = [
      { name: 'NestJS', patterns: ['NestJS', 'Nest.js', '@nestjs', 'Nest'] },
      { name: 'Express.js', patterns: ['Express', 'express.js', 'node:http'] },
      { name: 'Next.js', patterns: ['Next.js', 'NextJS', 'next/'] },
      { name: 'React', patterns: ['React', 'react/', 'useState', 'useEffect'] },
      { name: 'Laravel', patterns: ['Laravel', 'Illuminate', '@laravel'] },
      { name: 'Django', patterns: ['Django', 'django.', 'models.py'] },
      { name: 'Spring Boot', patterns: ['Spring', '@SpringBoot', 'Java'] },
      { name: 'Go', patterns: ['Golang', 'go.', 'func main'] },
      { name: 'Rust', patterns: ['Rust', 'fn main', 'cargo'] },
    ];

    for (const framework of frameworks) {
      if (framework.patterns.some((p) => context.includes(p))) {
        return framework.name;
      }
    }
    return 'Node.js/NestJS';
  }

  /**
   * ✅ الحصول على لغة البرمجة المناسبة للإطار
   */
  private getLanguage(framework: string): string {
    const languageMap: Record<string, string> = {
      NestJS: 'typescript',
      'Express.js': 'javascript',
      'Next.js': 'typescript',
      React: 'typescript',
      Laravel: 'php',
      Django: 'python',
      'Spring Boot': 'java',
      Go: 'go',
      Rust: 'rust',
    };
    return languageMap[framework] || 'typescript';
  }

  /**
   * ✅ تنسيق الرد النهائي
   */
  private formatResponse(text: string): string {
    // ✅ إزالة أي Markdown غير مرغوب فيه
    let formatted = text
      .replace(/```markdown/g, '```')
      .replace(/```\s*markdown/g, '```');

    // ✅ التأكد من وجود أقسام رئيسية
    if (!formatted.includes('## 🔍 Risk Analysis')) {
      formatted =
        `## 🔍 Risk Analysis\n⚠️ A security vulnerability was identified that requires immediate attention.\n\n` +
        formatted;
    }

    if (!formatted.includes('## 🛡️ Recommended Fix')) {
      formatted =
        formatted +
        `\n\n## 🛡️ Recommended Fix\nImplement the following security measures to address this vulnerability.`;
    }

    if (!formatted.includes('## 💻 Code Implementation')) {
      formatted =
        formatted +
        `\n\n## 💻 Code Implementation\n\`\`\`typescript\n// Implement the security fix here\n\`\`\``;
    }

    return formatted;
  }

  /**
   * ✅ Fallback عندما يفشل Gemini
   */
  private generateFallbackRemediation(
    vulnerabilityTitle: string,
    description: string,
    framework: string,
  ): string {
    const language = this.getLanguage(framework);

    return `
## 🔍 Risk Analysis
**Vulnerability:** ${vulnerabilityTitle}
**Description:** ${description}
**Severity:** High
**Attack Vector:** Remote exploitation possible

## 🛡️ Recommended Fix
1. **Validate Input:** Sanitize and validate all user inputs
2. **Implement Security Headers:** Add proper security headers
3. **Use Parameterized Queries:** Prevent SQL injection
4. **Limit Exposure:** Restrict access to sensitive endpoints

## 💻 Code Implementation
\`\`\`${language}
// ✅ Security Fix for ${vulnerabilityTitle}
// Framework: ${framework}

// Example: Add security headers middleware
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// Apply headers to all responses
app.use((req, res, next) => {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  next();
});
\`\`\`

## ✅ Verification Steps
1. Test the application after implementing the fix
2. Use security scanning tools to verify
3. Monitor for any regressions

## 📚 Additional Resources
- [OWASP Top 10](https://owasp.org/Top10/)
- [CWE - Common Weakness Enumeration](https://cwe.mitre.org/)
`;
  }

  /**
   * ✅ توليد اقتراحات إصلاح سريعة (بدون AI)
   */
  async generateQuickFix(vulnerabilityTitle: string): Promise<string> {
    const quickFixes: Record<string, string> = {
      'Missing Security Header: CSP':
        'Add Content-Security-Policy header to prevent XSS attacks.',
      'Missing Security Header: HSTS':
        'Add Strict-Transport-Security header to enforce HTTPS.',
      'Missing Security Header: XCTO':
        'Add X-Content-Type-Options: nosniff to prevent MIME type sniffing.',
      'Missing Security Header: XFO':
        'Add X-Frame-Options: DENY to prevent clickjacking.',
      'Missing Security Header: Referrer':
        'Add Referrer-Policy: strict-origin-when-cross-origin.',
      'CORS Misconfiguration':
        'Configure specific allowed origins instead of using wildcard (*).',
    };

    for (const [key, fix] of Object.entries(quickFixes)) {
      if (vulnerabilityTitle.includes(key)) {
        return fix;
      }
    }

    return 'Implement proper security headers and input validation.';
  }
}
