# دليل فهم الباك إند والشبكات لمشروع ScanLens

هذا الدليل يشرح كيف تنتقل طلبات المستخدم في ScanLens من المتصفح إلى الخادم، وكيف يتعامل الخادم مع قاعدة البيانات وRedis والطابور، مع أمثلة من الكود الموجود في المشروع. الهدف أن تفهم الفكرة والكود وتقدر تشرحهما في مقابلة، وليس حفظ التعريفات فقط.

---

## 1. الصورة الكبيرة

المشروع يتكون من أجزاء تتعاون معًا:

1. **الواجهة الأمامية Frontend:** صفحة Next.js تعمل في متصفح المستخدم.
2. **الـ API:** خادم NestJS يستقبل طلبات HTTP ويطبق قواعد العمل.
3. **قاعدة البيانات PostgreSQL:** تحفظ المستخدمين والفحوصات وسجلات الاستخدام.
4. **Redis وBullMQ:** يحتفظان بمهام الفحص التي تنتظر التنفيذ أو تعمل.
5. **Worker:** كود في الخادم يسحب المهام من الطابور وينفذها.
6. **الموقع الهدف:** الموقع الذي يطلب المستخدم فحصه؛ الخادم يتصل به عبر HTTP أو HTTPS.

رسم مبسط:

```text
المستخدم
   │ يضغط «افحص»
   ▼
واجهة Next.js في المتصفح
   │ HTTP request عبر الإنترنت
   ▼
NestJS API
   ├── يتحقق من الهوية والخطة
   ├── PostgreSQL عبر Prisma: قراءة/حفظ بيانات
   └── Redis عبر BullMQ: وضع مهمة الفحص
                              │
                              ▼
                         Scan Worker
                              │ HTTP/HTTPS request
                              ▼
                         الموقع الهدف
                              │
                              ▼
                    نتيجة الفحص إلى Redis
                              │
                 الواجهة تستعلم عن الحالة
                              ▼
                   تعرض النتيجة للمستخدم
```

---

## 2. ما المقصود بالشبكة في هذا المشروع؟

الشبكة هي الطريق الذي تنتقل عبره البيانات بين برامج تعمل على أجهزة أو عمليات مختلفة. في هذا المشروع توجد اتصالات منفصلة:

### أ. المتصفح يتصل بالـ API

عندما تنفذ الواجهة:

```ts
await api.post("/scans/direct-scan", {
  url: "https://github.com",
  deepScan: true,
});
```

يقوم المتصفح بإرسال طلب HTTP إلى العنوان الأساسي الموجود في `NEXT_PUBLIC_API_URL`، ويضيف إليه المسار `/scans/direct-scan`.

ملف `client/lib/api.ts` ينشئ عميل Axios:

```ts
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});
```

- `baseURL`: عنوان الخادم.
- `withCredentials: true`: يسمح للمتصفح بإرسال ملفات تعريف الارتباط cookies، ومنها رمز الدخول إذا كان مخزنًا كـ cookie.
- `Content-Type`: يخبر الخادم أن جسم الطلب JSON.

مثال على شكل الطلب:

```http
POST /scans/direct-scan HTTP/1.1
Host: api.example.com
Content-Type: application/json
Cookie: access_token=...

{"url":"https://github.com","deepScan":true}
```

هذا مثال توضيحي؛ الاسم الفعلي للـ cookie يعتمد على إعدادات المصادقة في المشروع.

### ب. ماذا يحدث على مستوى الشبكة؟

بشكل مبسط، عند الاتصال بعنوان مثل `https://api.example.com`:

1. **DNS:** يحوّل اسم النطاق إلى عنوان IP.
2. **TCP:** ينشئ اتصالًا موثوقًا بين العميل والخادم. عادةً HTTPS يستخدم المنفذ 443.
3. **TLS:** يتفاوض الطرفان على اتصال مشفر ويتحقق المتصفح من شهادة الخادم.
4. **HTTP:** يرسل المتصفح الطريقة والمسار والرؤوس وجسم الطلب.
5. يرد الخادم برمز حالة HTTP وجسم استجابة، غالبًا JSON.

إذا فشل DNS أو تعذر الوصول إلى قاعدة البيانات أو Redis، فهذه أعطال في اتصالات مختلفة، حتى لو كان اسم الخطأ يحتوي على كلمة “connection”.

### ج. الخادم يتصل بالموقع المراد فحصه

بعد قبول مهمة الفحص، الخادم نفسه هو الذي يطلب الموقع الهدف؛ ليس متصفح المستخدم:

```ts
const response = await axios.get(formattedUrl, {
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: () => true,
});
```

هذا يعني أن هناك اتصالًا ثانيًا مستقلًا:

```text
Worker في خادم ScanLens ── HTTP/HTTPS ──> الموقع الهدف
```

الخادم يقرأ استجابة الموقع، مثل status code وHTTP headers، ثم يحسب نتيجة الأمان.

---

## 3. الأجزاء الأساسية في NestJS

### Module

الـ Module يجمع أجزاء ذات علاقة ويخبر NestJS ما الخدمات والمتحكمات التي يحتاج إلى إنشائها. مثلًا `ScansModule` يضم `ScansController` و`ScansService` ويستورد وحدات يحتاجها:

```ts
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => QueueModule),
    SubscriptionModule,
  ],
  controllers: [ScansController],
  providers: [ScansService, ExportService],
})
export class ScansModule {}
```

### Controller

المتحكم يستقبل طلب HTTP، يقرأ المسار والجسم والمستخدم الحالي، ثم يستدعي Service. من الأفضل ألا نضع فيه تفاصيل الفحص أو الاستعلامات المعقدة.

### Service

الخدمة تحتوي منطق العمل. `ScansService` مثلًا يتحقق من الرابط والخطة، يطلب الموقع، يحلل الاستجابة، ويحفظ الفحص.

### Dependency Injection

NestJS ينشئ الخدمات ويوصلها ببعضها. عندما نكتب:

```ts
constructor(private readonly queueService: QueueService) {}
```

نحن نطلب من NestJS تزويد هذا المتحكم بنسخة `QueueService`، بدل إنشاء النسخة يدويًا باستخدام `new QueueService()`. هذا يسهل الاختبار ويجعل إدارة الاعتماديات مركزية.

---

## 4. شرح تدفق الفحص للمستخدم المسجل

### المرحلة 1: المستخدم يرسل طلب بدء الفحص

الواجهة ترسل الرابط وخيار الفحص العميق إلى:

```http
POST /scans/direct-scan
```

في [scans.controller.ts](../server/src/scans/scans.controller.ts) المسار محمي بـ `JwtAuthGuard`:

```ts
@Post('direct-scan')
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.ACCEPTED)
async directScan(@Body() body, @Req() req) {
  const userId = req.user?.id;
  // ...
}
```

- `@Post`: هذا endpoint يستقبل POST.
- `@UseGuards`: يجب أن ينجح فحص الهوية قبل تشغيل الدالة.
- `@Body`: بيانات JSON القادمة من الواجهة.
- `@Req`: معلومات طلب HTTP، ومنها المستخدم الذي عرّفه الحارس.
- `202 Accepted`: الخادم قبل المهمة، لكنه لم يقل إن الفحص انتهى. هذا مناسب للعمليات الطويلة.

الحارس لا يقرر وحده صلاحية الخطة؛ دوره الأساسي التأكد من هوية المستخدم. قواعد الخطة تُراجع في منطق الفحص.

### المرحلة 2: التحقق قبل إدخال المهمة

المتحكم يستدعي:

```ts
await this.scansService.validateScanRequest(
  body.url,
  userId,
  body.deepScan || false,
);
```

التحقق يمنع إدخال رابط غير صالح أو طلب يتجاوز حدود الخطة. الفائدة أن الطابور لا يمتلئ بطلبات نعرف مسبقًا أنها غير مقبولة.

### المرحلة 3: إضافة المهمة إلى BullMQ

بعد التحقق، يرسل المتحكم بيانات المهمة إلى `QueueService`:

```ts
const { jobId, queueInfo } = await this.queueService.addScanJob({
  url: body.url,
  userId,
  isDeepScan: body.deepScan || false,
});

return { jobId, status: "waiting", queueInfo };
```

`QueueService` يضيف المهمة إلى الطابور:

```ts
const job = await this.scanQueue.add("scan", data, {
  priority,
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 3000,
  },
});
```

- `"scan"` اسم نوع المهمة.
- `data` هي المدخلات التي سيحتاجها العامل.
- `job.id` رقم المهمة الذي تستخدمه الواجهة للاستعلام عنها.
- `attempts: 3` يسمح بثلاث محاولات للمهمة عند الأخطاء القابلة لإعادة المحاولة.
- `exponential backoff` يزيد مدة الانتظار قبل كل محاولة لاحقة. مع 3000ms تكون الفترات تقريبًا 3 ثم 6 ثوانٍ.
- أولوية BullMQ الأقل رقمًا تُعالج قبل الرقم الأكبر عندما تتنافس المهام المنتظرة. الكود يعطي المسجل أولوية `1`.

BullMQ يستخدم Redis لتخزين حالة المهمة وبيانات الطابور. Redis هنا ليس قاعدة بيانات المستخدمين الأساسية؛ PostgreSQL يقوم بهذا الدور.

### المرحلة 4: الرد الفوري للواجهة

بدل الانتظار حتى ينتهي الفحص، يرجع الخادم مثلًا:

```json
{
  "jobId": "76",
  "status": "waiting",
  "queueInfo": {
    "position": 1,
    "queueSize": 0,
    "priority": "priority"
  }
}
```

الاستجابة تعني «قبلنا المهمة»، لا «اكتمل الفحص». في مقابلة العمل، اشرح أن هذا هو الفرق بين استجابة متزامنة طويلة واستجابة غير متزامنة لمهمة خلفية.

### المرحلة 5: العامل يسحب المهمة

`ScanProcessor` هو الـ Worker المرتبط باسم الطابور:

```ts
@Processor("scan-queue", { concurrency: 3 })
export class ScanProcessor extends WorkerHost {
  async process(job: Job<ScanJobData>) {
    const { url, userId, isDeepScan } = job.data;
    const result = await this.scansService.scanUrl(
      url,
      userId,
      isDeepScan,
    );
    return result;
  }
}
```

- اسم `scan-queue` يجب أن يطابق اسم الطابور المسجل.
- `process()` هي نقطة تنفيذ كل مهمة.
- `job.data` هي البيانات التي أضيفت في `QueueService`.
- `concurrency: 3` يسمح لهذا العامل بمعالجة حتى ثلاث مهام معًا. لا يعني ذلك أن كل مهمة واحدة تنقسم إلى ثلاثة أجزاء.

العامل هنا يعمل ضمن تطبيق NestJS نفسه، لكنه منفصل منطقيًا عن طلب HTTP: يمكن أن ينتهي اتصال HTTP الأول بينما تستمر المهمة.

### المرحلة 6: تنفيذ الفحص وحفظ النتيجة

`ScansService.scanUrl()` ينفذ تقريبًا هذه الخطوات:

1. يتحقق من صيغة الرابط.
2. يتحقق من حدود الاستخدام والخطة.
3. يرسل طلبًا للموقع الهدف عبر Axios.
4. يفحص رؤوس الأمان.
5. في الفحص العميق يفحص معلومات SSL وCORS.
6. يحسب الدرجة والثغرات.
7. يحفظ بيانات الفحص وسجل الاستخدام في PostgreSQL للمستخدم المسجل.
8. يرجع كائن النتيجة.

تنبيه دقيق: في `scanUrl()` عملية الحفظ محاطة بـ `try/catch` يسجل تحذيرًا ثم يكمل إرجاع نتيجة الفحص. لذلك قد يرى العميل نتيجة ناجحة حتى لو فشل حفظ السجل. هذا سلوك best-effort في الكود الحالي، وليس ضمانًا بأن كل نتيجة أُرسلت للعميل محفوظة.

### المرحلة 7: الواجهة تستعلم عن الحالة

المتصفح يطلب:

```http
GET /scans/jobs/76
```

والخادم يعيد حالة المهمة ونتيجتها عندما تكتمل:

```json
{
  "id": "76",
  "status": "active",
  "progress": 90,
  "result": null,
  "position": null
}
```

الحالات المعتادة في BullMQ تشمل `waiting`, `active`, `completed`, `failed`, و`delayed`.

الواجهة تعيد الاستعلام كل ثانية في التنفيذ الحالي. هذا يسمى **Polling**: العميل يسأل الخادم دوريًا «هل تغيرت الحالة؟». بديل ذلك WebSocket أو Server-Sent Events، حيث يرسل الخادم التحديث للعميل عند حصوله بدل تكرار الطلب.

### المرحلة 8: عرض النتيجة

عندما تصبح الحالة `completed`، يقرأ العميل `result` ويعرض الدرجة والثغرات. وعندما تصبح `failed`، يعرض خطأ مناسبًا.

---

## 5. ماذا تفعل قاعدة البيانات وPrisma؟

PostgreSQL قاعدة بيانات دائمة: البيانات تبقى بعد إعادة تشغيل التطبيق. Prisma هو ORM، أي طبقة تساعد TypeScript على تنفيذ استعلامات قاعدة البيانات بطريقة منظمة.

ملف `PrismaService` يرث من `PrismaClient` ويتصل بقاعدة البيانات عند تشغيل التطبيق:

```ts
export class PrismaService extends PrismaClient {
  async onModuleInit() {
    await this.$connect();
  }
}
```

لهذا قد يفشل بدء NestJS بالكامل إذا لم يمكن الوصول إلى PostgreSQL؛ فالاتصال جزء من تهيئة التطبيق.

مثال مفهوم على قراءة سجل:

```ts
const scans = await this.prisma.scan.findMany({
  where: { websiteId: { in: websiteIds } },
  orderBy: { createdAt: "desc" },
});
```

- `where`: شرط التصفية.
- `orderBy`: ترتيب النتائج.
- `findMany`: إرجاع مجموعة سجلات.

العلاقة في المشروع تكون مثل:

```text
User ── لديه Websites ── لكل Website Scans ── لكل Scan Vulnerabilities
```

عند الحذف، علاقات قاعدة البيانات قد تحذف السجلات التابعة حسب إعداد `onDelete: Cascade` في مخطط Prisma.

---

## 6. لماذا نستخدم Redis/BullMQ بدل تشغيل الفحص داخل الطلب؟

الفحص قد يأخذ وقتًا بسبب الاتصال بالموقع وفحص TLS وقراءة قاعدة البيانات. لو نفذناه داخل طلب HTTP مباشرة:

- يبقى المتصفح ينتظر الاتصال مفتوحًا.
- قد ينتهي timeout في المتصفح أو proxy.
- يصعب تنظيم عدة فحوصات متزامنة.
- يصعب إعادة محاولة العمل بعد عطل مؤقت.

مع الطابور:

- API يقبل الطلب بسرعة ويعيد `jobId`.
- Redis يحتفظ بالمهمة.
- العامل ينفذها حسب قدرته.
- BullMQ يدير الحالات والمحاولات والتأخير.
- الواجهة تستطيع متابعة المهمة منفصلة عن طلب البدء.

### Redis ليس PostgreSQL

| PostgreSQL + Prisma | Redis + BullMQ |
|---|---|
| المستخدمون والخطط وسجل الفحوصات | مهام تنتظر أو تعمل |
| قاعدة البيانات الأساسية والدائمة | وسيط سريع لإدارة العمل الخلفي |
| تستخدمه `ScansService` لحفظ النتيجة | يستخدمه `QueueService` و`ScanProcessor` للطابور |

---

## 7. الضيف مقابل المستخدم المسجل في الكود الحالي

المسجل يستخدم مسارًا غير متزامن:

```text
POST /scans/direct-scan
→ jobId
→ GET /scans/jobs/:jobId
→ result
```

الضيف حاليًا يستخدم مسارًا مباشرًا:

```text
POST /scans/guest-scan
→ انتظار انتهاء scanUrl()
→ result
```

أي أن الضيف لا يستخدم الطابور في التدفق الحالي. كما أن عدّاد محاولات الضيف في الواجهة محفوظ في `localStorage`؛ لذلك هو تجربة مستخدم وليس حدًا أمنيًا قويًا، إذ يمكن للمستخدم مسحه أو استخدام متصفح آخر. الحد الذي يجب الاعتماد عليه أمنيًا ينبغي فرضه في الخادم.

---

## 8. كيف نفهم رموز HTTP المهمة؟

| الرمز | معناه في هذا السياق |
|---|---|
| `200 OK` | الطلب نجح وأعيدت نتيجة مباشرة، مثل استعلام الحالة الناجح |
| `202 Accepted` | تم قبول مهمة الفحص، لكنها لم تنتهِ بعد |
| `400 Bad Request` | بيانات الطلب غير صحيحة، مثل رابط غير صالح |
| `401 Unauthorized` | لا توجد هوية صالحة أو انتهت جلسة الدخول |
| `403 Forbidden` | المستخدم معروف لكن غير مسموح له بتنفيذ العملية |
| `404 Not Found` | المهمة غير موجودة أو لا يحق لهذا المستخدم رؤيتها |
| `500 Internal Server Error` | خطأ غير متوقع في الخادم |
| `503 Service Unavailable` | خدمة لازمة غير متاحة مؤقتًا، مثل تعذر الوصول إلى مورد خارجي |

---

## 9. أسئلة مقابلة وإجابات مقترحة

### ما الفرق بين Frontend وBackend؟

الـ Frontend هو واجهة المستخدم التي تعمل في المتصفح وتجمع مدخلاته وتعرض النتائج. الـ Backend هو الخادم الذي يستقبل الطلبات، يتحقق من الهوية والصلاحيات، ينفذ منطق التطبيق، ويتعامل مع قاعدة البيانات والخدمات الأخرى. الواجهة لا ينبغي أن تتصل بقاعدة البيانات مباشرة.

### ما هو REST API؟

هو أسلوب لتقديم موارد وعمليات عبر HTTP. في المشروع `POST /scans/direct-scan` يطلب بدء عملية فحص، و`GET /scans/jobs/:jobId` يقرأ حالة المهمة.

### ما الفرق بين `POST` و`GET`؟

`GET` عادةً لقراءة بيانات ولا يفترض أن يغيرها. `POST` يرسل بيانات للخادم لتنفيذ عملية أو إنشاء مورد، مثل إنشاء مهمة فحص.

### لماذا استخدمتم `202 Accepted`؟

لأن بدء الفحص لا يعني أن الفحص اكتمل. الخادم قبل المهمة ووضعها في الطابور، لذلك يرجع `202` مع `jobId` ويقرأ العميل النتيجة لاحقًا.

### ما هو Worker؟

برنامج أو جزء من التطبيق يستهلك مهام الطابور وينفذها بعيدًا عن دورة طلب HTTP. عندنا `ScanProcessor` هو العامل، و`process()` تنفذ كل مهمة فحص.

### ما فائدة Retry وBackoff؟

بعض الأعطال مؤقتة مثل timeout أو انقطاع شبكة. إعادة المحاولة قد تنجح لاحقًا. Backoff يؤخر المحاولات تدريجيًا بدل إعادة الضغط على الخدمة فورًا. أما الخطأ الدائم مثل إدخال غير صالح فلا يفيد تكراره؛ لذلك يعامل الكود `BadRequestException` و`ForbiddenException` كأخطاء غير قابلة لإعادة المحاولة.

### كيف تتأكدون من أن المستخدم لا يرى مهمة شخص آخر؟

Endpoint الحالة محمي بالمصادقة، ثم `QueueService.getJobStatus()` يقارن `userId` داخل بيانات المهمة مع `userId` الحالي. إذا لم تتطابق، يعيد `404`.

### ما هو Dependency Injection؟

هو أن إطار العمل ينشئ الكائنات المطلوبة ويوصلها ببعضها. بدل أن ينشئ Controller الـ Service بنفسه، NestJS يحقنها في constructor. هذا يقلل الترابط ويسهل الاختبار.

### ما الفرق بين Authentication وAuthorization؟

- Authentication: من أنت؟ مثل التحقق من JWT أو جلسة المستخدم.
- Authorization: ما العمليات المسموح لك بها؟ مثل التحقق من الخطة أو الدور أو ملكية المهمة.

### ما الفرق بين PostgreSQL وRedis هنا؟

PostgreSQL يخزن بيانات التطبيق طويلة الأمد مثل الفحوصات والمستخدمين. Redis يستخدمه BullMQ لتنسيق المهام وحالاتها بسرعة.

### ماذا يحصل لو تعطل Redis؟

قد يفشل API في إضافة المهمة أو قد يتوقف العامل عن سحب المهام. ينبغي إظهار خطأ واضح ومراقبة الاتصال؛ لا ينبغي إرجاع نتيجة توحي بنجاح الفحص إذا لم تضف المهمة.

### ماذا يحصل لو تعطل الموقع الهدف؟

قد يفشل اتصال Axios بسبب DNS أو timeout أو رفض الاتصال. بعض هذه الأخطاء يعاد تنفيذها بواسطة BullMQ وفق إعداد المحاولات والتأخير، وبعد استنفاد المحاولات تصبح المهمة فاشلة.

### ما هو CORS؟

سياسة يطبقها المتصفح للتحكم بطلبات JavaScript بين أصول مختلفة، مثل واجهة على `app.example.com` وAPI على `api.example.com`. إعداد CORS في الخادم يجب أن يسمح بأصل الواجهة، ومع cookies يحتاج السماح بالبيانات الاعتمادية وإرسالها من العميل.

### كيف أشرح تدفق الفحص في دقيقة؟

> المستخدم يرسل رابطًا من واجهة Next.js إلى NestJS عبر POST. الحارس يتحقق من جلسة المستخدم، والـ Controller يمرر الطلب إلى Service للتحقق من الرابط والخطة. بعدها QueueService يضيف مهمة إلى BullMQ في Redis ويرجع jobId مع 202. ScanProcessor يسحب المهمة وينفذ الفحص عبر ScansService، الذي يطلب الموقع الهدف عبر HTTPS ويحفظ النتيجة في PostgreSQL عبر Prisma. الواجهة تعمل polling على endpoint الحالة إلى أن تصبح المهمة completed، ثم تعرض النتيجة.

---

## 10. تشخيص المشاكل من السجلات

عند تتبع فحص واحد، ابحث عن هذا التسلسل:

```text
QueueService: Job added
ScanProcessor: Processing scan
ScansService: Formatted URL / Response Status
ScanProcessor: Scan completed
QueueService: Job ... completed
```

المعاني:

- `Job added`: وصل الطلب إلى QueueService وأضيف إلى Redis.
- `Processing scan`: العامل سحب المهمة وبدأها.
- `Response Status`: العامل وصل للموقع الهدف واستلم استجابة HTTP.
- `Scan completed`: منطق الفحص انتهى وأعاد نتيجة.
- `completed`: BullMQ سجل المهمة مكتملة.

إذا ظهر `Job added` فقط ولا يظهر `Processing scan`، افحص تسجيل العامل واتصاله بالطابور وRedis. إذا ظهر `Processing scan` ثم فشل Axios، افحص اتصال الخادم بالموقع الهدف. إذا ظهر `PrismaClientInitializationError`، افحص اتصال PostgreSQL و`DATABASE_URL`.

لا تشارك في السجلات العامة كلمات المرور أو JWT أو رموز التحقق أو connection strings. سجلات التطوير قد تحتوي بيانات حساسة؛ يجب تعطيل طباعة رمز التحقق في الإنتاج.

---

## 11. مصطلحات سريعة للحفظ والفهم

- **Endpoint:** عنوان وطريقة HTTP لتنفيذ عملية، مثل `GET /scans/jobs/:jobId`.
- **Request:** ما يرسله العميل إلى الخادم.
- **Response:** ما يرجعه الخادم، ويحتوي status code ورؤوسًا وجسمًا.
- **Payload / Body:** البيانات المرسلة، غالبًا JSON.
- **JWT:** رمز يحمل ادعاءات هوية موقّعة رقميًا؛ لا يعني وحده أن كل عملية مسموحة.
- **ORM:** أداة تربط كود التطبيق بجداول قاعدة البيانات؛ Prisma هو ORM هنا.
- **Queue:** قائمة مهام تنتظر أو تعمل.
- **Job:** مهمة مفردة داخل الطابور، لها بيانات ومعرّف وحالة.
- **Worker:** مستهلك المهام الذي ينفذها.
- **Concurrency:** عدد المهام التي يستطيع العامل معالجتها في الوقت نفسه.
- **Polling:** استعلام العميل عن الحالة على فترات متكررة.
- **Timeout:** حد أقصى للانتظار قبل اعتبار الاتصال متأخرًا أو فاشلًا.
- **Retry:** إعادة محاولة مهمة بعد فشل قابل للتعافي.
- **TLS:** تشفير الاتصال والتحقق من هوية الخادم في HTTPS.

---

## 12. كيف تذاكر هذا الدليل عمليًا؟

1. اشرح الرسم الكبير بصوتك دون قراءة.
2. تتبع الفحص في الكود بهذا الترتيب: الواجهة، ثم Controller، ثم QueueService، ثم Processor، ثم ScansService، ثم Prisma.
3. افتح السجلات وابحث عن `Job added` ثم `Processing scan` ثم `completed`.
4. حاول الإجابة عن أسئلة المقابلة بكلماتك، واذكر مثالًا من المشروع في كل إجابة.
5. لا تدّعِ أن الضيوف يستخدمون الطابور حاليًا؛ مسارهم في الكود مباشر، بينما المستخدم المسجل يمر عبر BullMQ.

---

## 13. تسجيل الدخول والتحقق من الحساب خطوة بخطوة

### التسجيل

المتصفح يرسل بيانات التسجيل إلى:

```http
POST /auth/register
Content-Type: application/json

{"name":"Sara","email":"sara@example.com","password":"example-password"}
```

المتحكم يستقبل البيانات ثم يمررها إلى `AuthService.register()`. الخدمة:

1. تبحث عن بريد موجود مسبقًا.
2. تحول كلمة المرور إلى hash باستخدام bcrypt؛ كلمة المرور الأصلية لا يجب حفظها.
3. تنشئ رمز تحقق مؤقتًا وتنتهي صلاحيته بعد عشر دقائق.
4. تنشئ المستخدم في PostgreSQL باستخدام Prisma.
5. تطلب من `MailService` إرسال الرمز.

مثال من منطق الخدمة:

```ts
const existingUser = await this.prisma.user.findUnique({
  where: { email: dto.email },
});
if (existingUser) throw new ConflictException("Email already registered");

const passwordHash = await bcrypt.hash(dto.password, 10);
const otp = this.generateOtp();
const verificationExpires = new Date(Date.now() + 10 * 60 * 1000);

const user = await this.prisma.user.create({
  data: {
    email: dto.email,
    passwordHash,
    name: dto.name,
    verificationCode: otp,
    verificationExpires,
  },
});
```

`10` في bcrypt هو عامل كلفة hashing، وليس طول كلمة المرور. كلما زاد زادت كلفة حساب الـ hash، وهذا يجعل تخمين كلمات المرور المسروقة أبطأ.

### التحقق من الرمز

الواجهة ترسل البريد والرمز إلى `POST /auth/verify-otp`. الخدمة تبحث عن المستخدم، وتقارن الرمز وتاريخ الانتهاء، ثم تغيّر `isVerified` إلى `true` وتمسح الرمز من سجل المستخدم:

```ts
if (!user || user.verificationCode !== inputCode) {
  throw new BadRequestException("Invalid verification code");
}

if (user.verificationExpires && user.verificationExpires < new Date()) {
  throw new BadRequestException("Verification code has expired");
}

await this.prisma.user.update({
  where: { email },
  data: {
    isVerified: true,
    verificationCode: null,
    verificationExpires: null,
  },
});
```

بعدها ينشئ الخادم JWT. الـ JWT عبارة عن بيانات موقّعة، وليس قاعدة بيانات ولا كلمة مرور مشفرة:

```ts
return this.jwtService.sign(
  { sub: userId, email, role },
  { expiresIn: "7d" },
);
```

`sub` هو subject، ويحتوي هنا معرّف المستخدم. إعداد `expiresIn` يجعل الرمز صالحًا سبعة أيام. في التطبيق، `AuthController` يضعه في cookie اسمها `access_token` بإعداد `httpOnly`؛ وفي الإنتاج يضبط `secure` و`sameSite`.

### كيف يعرف كل endpoint من هو المستخدم؟

1. المتصفح يرسل cookie أو `Authorization: Bearer <token>`.
2. `JwtAuthGuard` يطلب من Passport تشغيل استراتيجية JWT.
3. `JwtStrategy` يستخرج الرمز ويتحقق من توقيعه وانتهائه.
4. الاستراتيجية تقرأ `sub`، وتجلب المستخدم من قاعدة البيانات.
5. ترجع هوية محدودة مثل `id`, `email`, `role`, `plan`.
6. NestJS يضعها على `req.user`.

لذلك هذا الكود:

```ts
@UseGuards(JwtAuthGuard)
async getHistory(@Req() req) {
  return this.scansService.getUserHistory(req.user.id);
}
```

يعني: لا تنفذ الدالة إلا بعد التحقق من JWT، ثم اقرأ هوية صاحب الطلب من `req.user`.

`AdminGuard` طبقة إضافية: يتحقق من أن `req.user.role === "admin"`. عادةً نحتاج الحارسين معًا: JWT يثبت الهوية، وAdminGuard يثبت صلاحية الإدارة.

### تسجيل الدخول

`POST /auth/login` يبحث عن البريد، يقارن كلمة المرور مع bcrypt hash، ثم يرسل OTP جديدًا إلى البريد. بعد التحقق من الرمز يُصدر JWT. في هذا التصميم، نجاح كلمة المرور وحده لا يكفي لإنشاء جلسة دخول نهائية.

### إعادة تعيين كلمة المرور

التدفق الحالي هو: طلب OTP إلى البريد، التحقق منه، إصدار reset token قصير الصلاحية، ثم إرسال كلمة المرور الجديدة مع reset token. كلمة المرور الجديدة تُخزن كـ bcrypt hash.

---

## 14. كيف تمثل قاعدة البيانات العلاقات والسجلات؟

من ملف `server/prisma/schema.prisma` أهم الجداول هي:

```text
User
 ├── Website[]
 │    └── Scan[]
 │         └── Vulnerability[]
 ├── UsageLog[]
 └── Payment[]
```

ومثال مبسط على العلاقة:

```prisma
model User {
  id        String    @id @default(uuid())
  email     String    @unique
  plan      String    @default("free")
  websites  Website[]
  usageLogs UsageLog[]
  payments  Payment[]
}

model Website {
  id     String @id @default(uuid())
  url    String
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  scans  Scan[]
}

model Scan {
  id              String          @id @default(uuid())
  score           Int
  status          ScanStatus      @default(COMPLETED)
  websiteId       String
  website         Website         @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  vulnerabilities Vulnerability[]
  createdAt       DateTime        @default(now())
}
```

- `@id`: المفتاح الأساسي.
- `@default(uuid())`: أنشئ معرّفًا فريدًا تلقائيًا.
- `@unique`: لا تسمح بتكرار البريد.
- `@relation`: يربط صفًا بصف أو مجموعة صفوف في جدول آخر.
- `onDelete: Cascade`: حذف الأب يحذف بياناته التابعة بحسب العلاقة.
- `DateTime @default(now())`: وقت الإنشاء يحدده PostgreSQL تلقائيًا.

Prisma يترجم استدعاء TypeScript إلى SQL مناسب. مثال حفظ Scan مع ثغراته في عملية nested create:

```ts
const scan = await this.prisma.scan.create({
  data: {
    websiteId: website.id,
    score,
    status: ScanStatus.COMPLETED,
    completedAt: new Date(),
    vulnerabilities: {
      create: detectedVulnerabilities,
    },
  },
});
```

السطر `vulnerabilities.create` ينشئ صفوف الثغرات المرتبطة بالفحص. وتستطيع القراءة مع العلاقات باستخدام:

```ts
const history = await this.prisma.scan.findMany({
  where: { websiteId: { in: websiteIds } },
  include: { website: true, vulnerabilities: true },
  orderBy: { createdAt: "desc" },
});
```

### ما الذي يحفظه المشروع فعليًا؟

للمستخدم المسجل، مسار الفحص يحفظ:

1. صف `Website` إذا كان الرابط جديدًا لهذا المستخدم.
2. صف `Scan` يحتوي الدرجة والحالة والتواريخ.
3. صفوف `Vulnerability` المتولدة من الفحص.
4. صف `UsageLog` يسجل نوع الفحص وبعض البيانات الوصفية مثل الرابط والدرجة والخطة.

يُرجع الفحص أيضًا معلومات أغنى للواجهة مثل الترويسات وSSL وCORS والكوكيز. لكن مخطط `Scan` الحالي لا يحتوي أعمدة منفصلة لهذه التفاصيل؛ لذلك لا تفترض في مقابلة أن كل استجابة الفحص محفوظة كنسخة كاملة داخل PostgreSQL. بعض المعلومات تعيش في استجابة المهمة ونتيجة BullMQ المؤقتة، بينما سجل التاريخ الدائم يحفظ الحقول والعلاقات المذكورة في المخطط.

---

## 15. فحص الموقع بالتفصيل: من HTTP headers إلى الدرجة

### 1. تطبيع الرابط والتحقق منه

إذا كتب المستخدم `example.com`، يحاول الخادم إضافة `https://` ثم يستخدم `URL` لتحليل الرابط:

```ts
if (!url.startsWith("http://") && !url.startsWith("https://")) {
  url = `https://${url}`;
}

const parsedUrl = new URL(url);
if (!parsedUrl.hostname || parsedUrl.hostname.length < 3) {
  throw new BadRequestException("Invalid domain name");
}
```

المقصود بالتطبيع هو تحويل المدخل إلى صيغة موحدة يمكن استخدامها في طلب الشبكة.

### 2. التحقق من الخطة والحدود

`checkUserCapability()` يقرأ الخطة والدور من المستخدم ثم يستخدم إعدادات `PLANS` للتحقق من حد الفحوصات اليومية وDeep Scan. مثال منطق:

```ts
const plan = PLANS[user.plan as PlanId];
const window = await this.getUsageWindow(userId);

if (isDeepScan && window.deepScansToday >= plan.deepScanLimit) {
  throw new ForbiddenException("Daily deep scan limit reached");
}

if (!plan.unlimitedScans && window.scansToday >= plan.scansPerDay) {
  throw new ForbiddenException("Daily scan limit reached");
}
```

خطة المستخدم ليست نصًا يرسله المتصفح ويُصدقه الخادم؛ الخادم يقرأها من قاعدة البيانات. إعداد الخطط الحالي:

| الخطة | الفحوصات اليومية | Deep Scan | الاحتفاظ بالسجل | الحد المخزن |
|---|---:|---:|---:|---:|
| Free | 10 | 5 | 7 أيام | 50 |
| Pro | 50 | غير محدود | 30 يومًا | 500 |
| Extra | غير محدود | غير محدود | 90 يومًا | 2000 |
| Admin | يتجاوز حد الفحص في منطق ScansService | يتجاوز الحد | دائم | يعتمد على فحص التخزين |

### 3. الاتصال بموقع الهدف وقراءة الرؤوس

```ts
const response = await axios.get(formattedUrl, {
  timeout: 15000,
  maxRedirects: 5,
  validateStatus: () => true,
  headers: { "User-Agent": "ScanLens security scanner" },
});

const responseHeaders = response.headers;
```

- `timeout`: لا تنتظر إلى ما لا نهاية.
- `maxRedirects`: حد للتحويلات.
- `validateStatus: () => true`: Axios لا يرمي exception لمجرد أن الخادم رجع 404 أو 500؛ يستطيع الفاحص قراءة الحالة والرؤوس رغم ذلك.
- `response.headers`: الرؤوس التي أرسلها الموقع الهدف.

بعدها يقارن الخادم أسماء الرؤوس المطلوبة مع الموجودة، دون حساسية لحالة الأحرف:

```ts
const found = Object.keys(responseHeaders).some(
  (key) => key.toLowerCase() === requiredHeader,
);

if (found) presentHeaders.push(requiredHeader);
else missingHeaders.push(requiredHeader);
```

أمثلة الرؤوس التي يبحث عنها: CSP، HSTS، `X-Content-Type-Options`، `X-Frame-Options`، `Referrer-Policy` و`Permissions-Policy`.

### 4. حساب الدرجة

لكل رأس وزن. يحسب النظام مجموع الأوزان، ثم يقسم الوزن الموجود على الوزن الكلي:

```ts
let totalWeight = 0;
let earnedWeight = 0;

for (const header of securityHeaders) {
  const weight = headerWeights[header.name];
  totalWeight += weight;
  if (presentHeaders.includes(header.name)) earnedWeight += weight;
}

const score = Math.round((earnedWeight / totalWeight) * 100);
```

إذا كان كل الوزن 100، ووجد الخادم 80 نقطة من الرؤوس، تكون الدرجة `80/100`. هذا تقييم مبني على قواعد البرنامج؛ لا يعني ضمانًا بأن الموقع آمن بالكامل.

### 5. Deep Scan: TLS وCORS

إذا كان `isDeepScan` مفعّلًا، يستدعي الخادم `inspectSsl()`:

```ts
const socket = tls.connect(port, host, { servername: host }, () => {
  const cert = socket.getPeerCertificate();
  const result = {
    valid: socket.authorized,
    issuer: cert.issuer?.O || cert.issuer?.CN,
    validTo: cert.valid_to,
    protocol: socket.getProtocol(),
  };
  socket.end();
});
```

هذا ينشئ اتصال TLS إلى اسم الموقع، ويقرأ الشهادة والبروتوكول ونتيجة التحقق. `servername` مهم لـ SNI، لأن خادمًا واحدًا قد يستضيف مواقع متعددة بشهادات مختلفة. يوجد timeout للاتصال حتى لا يبقى العامل منتظرًا إلى الأبد.

ثم يقرأ سياسة CORS من:

```ts
const allowOrigin = responseHeaders["access-control-allow-origin"];
```

إذا كانت القيمة `*`، يصنف الكود الخطر على أنه HIGH ويخفض الدرجة وفق معادلة التطبيق. هذا مؤشر مبسط، وليس اختبارًا كاملًا لكل سيناريوهات CORS.

### 6. تحويل النتائج إلى ثغرات مفهومة

لكل رأس مفقود ينشئ الخادم عنصرًا يتضمن:

```ts
{
  title: "Missing Security Header: CSP",
  severity: "HIGH",
  description: "The HTTP header ... is not configured.",
  remediation: "Add Content-Security-Policy header ..."
}
```

بهذا تستطيع الواجهة عرض اسم المشكلة وخطورتها ووصفها وطريقة إصلاح مقترحة. في المسار الحالي التقييم يعتمد على HTTP headers وSSL/CORS؛ لا تصفه على أنه فحص شامل لكود الموقع أو قاعدة بياناته.

### نقطة مهمة عن Engines

هناك خدمات مثل `HeadersEngine`, `CookiesEngine`, و`HttpsEngine` موجودة ومحقونة في `ScansService`. لكن مسار `scanUrl()` الذي راجعناه يحتوي حاليًا على تحليل الرؤوس وSSL/CORS بشكل مباشر، ولا يستدعي هذه الـ engines فعليًا في مسار الفحص. لا تقل في مقابلة إن كل engine يشارك في كل فحص إلا بعد توصيله واستدعائه صراحة.

---

## 16. كيفية تطبيق مدة الاحتفاظ وحذف السجلات

يقرأ `getRetentionDays(plan, role)` مدة الحفظ من `PLANS`. قبل جلب السجل يستدعي `enforceRetentionForUser()`:

```ts
const cutoffDate = new Date();
cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

await this.prisma.scan.deleteMany({
  where: {
    websiteId: { in: websiteIds },
    createdAt: { lt: cutoffDate },
  },
});
```

التفسير:

- احسب تاريخًا يسبق الآن بمدة الاحتفاظ.
- احذف سجلات Scan التي تاريخ إنشائها أقدم من ذلك التاريخ.
- الثغرات التابعة تُحذف تلقائيًا بسبب `onDelete: Cascade`.
- الأدمن له `Infinity` في `getRetentionDays`، لذلك لا يحذف هذا التنظيف سجلاته.

هناك أيضًا Cron يومي في `ScansService.cleanExpiredScans()`. الـ Cron يعمل عندما يكون تطبيق NestJS شغالًا، لأن `ScheduleModule` مفعّل في التطبيق. إذا لم يكن الخادم يعمل وقت موعد Cron، فلن ينفذ المهمة أثناء توقفه، لكنه ينفذها عند موعد مجدول لاحق بعد تشغيله.

عند قراءة التاريخ أو إحصائيات التخزين، يطبق الكود التنظيف أولًا. هذا يعني أن السجل القديم يُحذف عند زيارة تلك المسارات أيضًا، وليس فقط عند منتصف الليل.

---

## 17. دورة الاشتراك والدفع والصلاحيات

### كيف يعرف التطبيق خطة المستخدم؟

جدول `User` يحتوي `plan` و`subscriptionExpiresAt`. إعداد خصائص الخطط المركزي في `server/src/plans/plans.config.ts`، مثل عدد الفحوصات والميزات ومدة الاحتفاظ.

مثال:

```ts
const plan = PLANS[user.plan as PlanId];
const canUseAiFix = plan.aiFixesEnabled;
const maxScans = plan.scansPerDay;
```

الفكرة: نخزن معرف الخطة للمستخدم، أما خصائصها فتُقرأ من الإعداد المركزي بدل تكرار الأرقام في كل endpoint.

### تفعيل وتجديد الاشتراك في الخدمة

`activateSubscription()` و`renewSubscription()` في `SubscriptionService` تقومان فعليًا بـ:

1. التحقق من وجود الخطة والمستخدم.
2. حساب تاريخ الانتهاء، 30 يومًا للشهري أو 365 يومًا للسنوي في الكود الحالي.
3. تحديث `User.plan` و`subscriptionExpiresAt`.
4. إنشاء صف `Payment` بحالة `SUCCEEDED`.
5. إنشاء `UsageLog` من نوع تفعيل أو تجديد.

مثال مبسط:

```ts
await this.prisma.user.update({
  where: { id: userId },
  data: { plan: planId, subscriptionExpiresAt: expiresAt },
});

await this.prisma.payment.create({
  data: {
    userId,
    amount: price,
    status: "SUCCEEDED",
    paidAt: new Date(),
  },
});
```

`Payment` سجل مالي/إداري، و`UsageLog` سجل حدث داخل التطبيق. هما ليسا الشيء نفسه.

### انتهاء الاشتراك

هناك وظيفة مجدولة تبحث عن مستخدمين خطتهم ليست free وتاريخ انتهاء اشتراكهم أقدم من الوقت الحالي:

```ts
const expiredUsers = await this.prisma.user.findMany({
  where: {
    plan: { not: "free" },
    subscriptionExpiresAt: { lt: new Date() },
  },
});
```

ثم تحول خطتهم إلى Free، وتسجل `SUBSCRIPTION_EXPIRED`، وترسل إشعار بريد. لأن التنفيذ مجدول يوميًا، قد يتأخر تطبيق downgrade حتى موعد التشغيل اليومي. والأفضل معماريًا أن تتحقق العمليات الحساسة من تاريخ الانتهاء نفسه، لا من قيمة `plan` وحدها.

### ما الذي يحدث عند الشراء؟

لا تفترض وجود تكامل دفع حي لمجرد وجود صف `Payment`. بعض وظائف الخدمة الحالية تنشئ دفعًا ناجحًا عند تفعيل الاشتراك بواسطة الأدمن أو عند تجديده من مسارات إدارية. قبل المقابلة، اشرح بدقة الفرق بين:

- **تسجيل دفعة في قاعدة البيانات**.
- **تحصيل حقيقي من مزود دفع** مثل Stripe.
- **Webhook موثوق** يؤكد نجاح عملية التحصيل.

لا تقل إن المشروع يشحن بطاقة بنكية فعليًا إلا إذا وجدت تكامل مزود الدفع وwebhook واختبرته.

### ملاحظة مهمة عن صلاحية API

في الكود الحالي يوجد `PUT /subscription/update-plan` محمي بـ `JwtAuthGuard` فقط، بينما تغيير خطة المستخدم يجب أن يكون محميًا بصلاحية إدارية أو نتيجة دفع موثقة. هذه نقطة حالية ينبغي إصلاحها قبل الإنتاج. كذلك فحص الخطة داخل `ScansService` يعتمد على قيمة `plan` ولا يتحقق بنفسه من `subscriptionExpiresAt` عند كل فحص؛ وظيفة انتهاء الاشتراك المجدولة هي التي تغير الخطة لاحقًا.

---

## 18. حدود الطابور والإعدادات التشغيلية

يهيئ `AppModule` الاتصال المركزي بـ BullMQ:

```ts
BullModule.forRoot({
  connection: process.env.REDIS_URL
    ? { url: process.env.REDIS_URL, maxRetriesPerRequest: null }
    : { host: "localhost", port: 6379, maxRetriesPerRequest: null },
});
```

ثم يسجل `QueueModule` اسم الطابور `scan-queue` ويحقن Worker و`QueueService`.

### دورة حالة المهمة

```text
waiting → active → completed
                  ↘ failed
```

- `waiting`: محفوظة وتنتظر عاملًا.
- `active`: العامل ينفذها الآن.
- `completed`: انتهى `process()` دون رمي خطأ؛ قيمة `return` تصبح `job.returnvalue`.
- `failed`: فشلت بعد الخطأ أو استنفاد المحاولات.
- `delayed`: تنتظر انتهاء فترة backoff قبل المحاولة التالية.

### ما معنى التقدم؟

العامل يستطيع إرسال رقم:

```ts
await job.updateProgress(10);
```

وتستطيع خدمة الحالة إعادة `job.progress`. النسبة تمثل قيمة يكتبها التطبيق؛ BullMQ لا يعرف تلقائيًا مقدار العمل المنجز.

### ما الذي تخبرنا به سجلات التشغيل؟

```text
Job added
Processing scan
Response Status: 200
Scan completed
Job completed
```

هذا التسلسل دليل أن الإضافة والمعالجة وفحص الموقع اكتملت. إذا رأيت `Job added` مرتين لنقرة واحدة، فالواجهة أو حدثها أرسل طلبين، وليس BullMQ هو من ضاعف المهمة تلقائيًا.

### الاحتفاظ بالمهام

الإعداد الحالي يحتفظ بالمكتملة مدة محدودة وبعدد أقصى، والفاشلة مدة أطول. نتيجة BullMQ ليست بديلًا عن قاعدة PostgreSQL كسجل تاريخ دائم. `jobId` المؤقت يصبح غير قابل للاستعلام بعد حذف المهمة من Redis.

---

## 19. الحماية وإعدادات HTTP في تشغيل NestJS

في `server/src/main.ts` يجهز التطبيق middleware وقيودًا عامة:

```ts
app.use(cookieParser());
app.use(helmet());
app.use(compression());
app.use("/auth/login", authLimiter);

app.enableCors({
  origin: allowedOrigins,
  credentials: true,
});
```

- **cookie-parser:** يحول Cookie header إلى `req.cookies`.
- **Helmet:** يضيف مجموعة HTTP security headers للاستجابة الصادرة من API.
- **Compression:** يضغط أجسام بعض الاستجابات لتقليل حجم النقل.
- **Rate limit:** يحد عدد الطلبات خلال نافذة زمنية، وخصوصًا محاولات الدخول.
- **CORS:** يحدد origins التي يسمح لها المتصفح بقراءة استجابة API. CORS حماية في المتصفح، وليس نظام مصادقة ولا يمنع كل عميل HTTP من الاتصال.
- **ValidationPipe:** في NestJS يمكنه تحويل المدخلات والتحقق منها وإزالة الحقول غير المسموحة، إذا استخدمت DTOs مزودة بقواعد `class-validator`.

مثال DTO نموذجي:

```ts
export class StartScanDto {
  @IsUrl({ require_protocol: false })
  url: string;

  @IsOptional()
  @IsBoolean()
  deepScan = false;
}
```

ثم:

```ts
async directScan(@Body() body: StartScanDto) { /* ... */ }
```

في المشروع توجد ValidationPipe عامة، لكن بعض endpoints معرفة بأنواع inline بدل DTOs؛ لا تفترض أن نوع TypeScript وحده يتحقق من JSON وقت التشغيل. Typescript types تختفي بعد البناء.

### لماذا توجد Cookie `httpOnly`؟

JavaScript في الصفحة لا يستطيع قراءة cookie ذات `httpOnly`، ما يقلل فرصة سرقة الرمز بواسطة بعض هجمات XSS. `secure` يطلب إرسالها عبر HTTPS فقط، و`sameSite` يحدد سلوك إرسالها عبر المواقع.

---

## 20. مسارات مهمة في API وكيفية شرحها

| المسار | الطريقة | من يستطيع استخدامه | ماذا يفعل |
|---|---|---|---|
| `/auth/register` | POST | عام | ينشئ حسابًا ويرسل OTP |
| `/auth/login` | POST | عام | يتحقق من كلمة المرور ويرسل OTP |
| `/auth/verify-otp` | POST | عام | يؤكد الحساب ويصدر JWT/cookie |
| `/scans/direct-scan` | POST | مستخدم مسجل | يتحقق ثم يضيف مهمة للطابور ويرجع jobId |
| `/scans/jobs/:jobId` | GET | مالك المهمة المسجل | يرجع الحالة والنتيجة |
| `/scans/guest-scan` | POST | ضيف | ينفذ الفحص مباشرة ويرجع النتيجة |
| `/scans/history` | GET | المستخدم نفسه | يرجع السجل الخاص به |
| `/scans/:id/export/pdf` | GET | محمي بالمصادقة | يولد PDF من سجل الفحص |
| `/subscription/plans` | GET | عام | يعرض تعريف الخطط |
| `/subscription/my-subscription` | GET | المستخدم نفسه | يعرض خطة المستخدم وانتهائها |

عادةً يقرأ Controller المدخلات ويختار status/guard، ثم يستدعي Service، ثم يحول النتيجة إلى JSON أو ملف. لا تضع استعلامات Prisma نفسها في كل Controller؛ وجود Service يجعل منطق العمل أسهل لإعادة الاستخدام والاختبار.

---

## 21. كيف يعمل التصدير إلى CSV وPDF؟

### CSV

`ExportService` يجلب بيانات الفحص من Prisma، ثم `json2csv` يحول قائمة الكائنات إلى نص CSV. Controller يضبط headers حتى يتعامل المتصفح مع الاستجابة كملف:

```ts
res.setHeader("Content-Type", "text/csv; charset=utf-8");
res.setHeader("Content-Disposition", 'attachment; filename="report.csv"');
return res.status(200).send(csvContent);
```

### PDF

PDFKit يبني المستند على شكل stream. الخدمة تجمع القطع في Buffer:

```ts
const buffers: Buffer[] = [];
doc.on("data", (chunk) => buffers.push(chunk));
doc.on("end", () => resolve(Buffer.concat(buffers)));
doc.on("error", reject);

doc.text("Security Audit Report");
doc.end();
```

الـ Controller يرسل Buffer مع `Content-Type: application/pdf` و`Content-Disposition: attachment`.

عند تصدير بيانات خاصة، يجب التحقق من ملكية سجل Scan للمستخدم قبل إرجاع التقرير. راجع تمرير userId من controller إلى service في endpoints التصدير قبل اعتبار حماية الملكية مكتملة.

---

## 22. الجداول والكيانات الأخرى

- **Payment:** المبلغ والعملة والحالة وتاريخ الدفع وبيانات إضافية JSON. المستخدم يرتبط بعدة مدفوعات.
- **UsageLog:** يسجل أحداثًا مثل `SCAN`, `DEEP_SCAN`, `SUBSCRIPTION_RENEWED`. يستخدمه المشروع أيضًا لحساب استهلاك بعض الحدود.
- **License:** مفاتيح الترخيص، الخطة، البريد المرتبط، ومن استخدم المفتاح ووقت الاستخدام.
- **SecurityRule / Finding / AIAnalysis:** بنية لقواعد ونتائج تحليل أمني وتحليل AI. افحص أي مسار قبل القول إن كل فحص ينشئ `Finding`؛ مسار `scanUrl()` الحالي الذي راجعناه يحفظ `Vulnerability` nested مع `Scan`.

تمييز مصطلحات البيانات:

- **Entity/Model:** شكل الجدول وعلاقاته، مثل `Scan`.
- **Row/Record:** سجل واحد داخل الجدول.
- **Primary key:** المعرف الأساسي للسجل.
- **Foreign key:** قيمة تربط السجل بجدول آخر، مثل `Scan.websiteId`.
- **Migration:** ملف يصف تغييرًا في بنية قاعدة البيانات ويطبقه على PostgreSQL.

---

## 23. ملاحظات صريحة عن حدود الكود الحالي

هذه النقاط لا تنتقص من فهمك؛ بالعكس، ذكرها بدقة في المقابلة يظهر أنك تميز بين التنفيذ الفعلي والتصميم المرغوب:

1. فحوصات المستخدمين المسجلين تمر بالطابور؛ الضيوف ما زالوا يستخدمون endpoint متزامنًا.
2. عداد الضيف في `localStorage` تجربة واجهة فقط ويمكن تجاوزه. فرض حد حقيقي يحتاج تتبعًا على الخادم مثل IP مع مراعاة الخصوصية أو session/معرّف ضيف موثوق وحدود rate-limit.
3. نتيجة الفحص الكاملة ليست كلها محفوظة في حقول جدول `Scan`؛ الجدول يحفظ الدرجة والحالة والعلاقات، والثغرات تحفظ في `Vulnerability`.
4. تحقّق الخطة في ScansService لا يفحص تاريخ `subscriptionExpiresAt` في كل طلب؛ توجد مهمة يومية تحول الاشتراك المنتهي إلى Free. إذا سألوك، اذكر أن فحص تاريخ الانتهاء inline سيكون أكثر حسمًا.
5. `PUT /subscription/update-plan` في الكود الحالي محمي بتسجيل الدخول فقط. تغيير خطة مدفوعة يجب أن يحتاج AdminGuard أو تأكيد دفع من backend موثوق.
6. التحقق من ملكية مهمة الطابور موجود في `getJobStatus`. تحقق كذلك من ملكية Scan في كل endpoint تصدير وحذف، ولا يكفي أن يكون الطالب مسجلًا.
7. `getQueueStats()` في QueueService يرجع قيمًا افتراضية عند بعض الأخطاء؛ أنظمة الإنتاج الأفضل أن تميز بين طابور فارغ وخطأ اتصال Redis بدل إخفاء الخطأ.
8. `SchedulerService.cleanupOldLogs()` الحالي يحسب cutoff ويسجل رسالة، لكنه لا ينفذ `deleteMany`. لا تقل إن هذه الدالة تنظف سجلات الاستخدام فعليًا دون إضافة الحذف.
9. `ScansService` يحقن HeadersEngine وCookiesEngine وHttpsEngine، لكن الفحص الأساسي يحلل بعض النتائج inline. وجود كلاس لا يعني أنه مستخدم.
10. سجلات التطوير قد تحتوي OTP وبيانات مستخدم. في الإنتاج لا ترجع رمز التحقق في API ولا تسجله في console، واستخدم logger يخفي البيانات الحساسة.

---

## 24. مثال شرح الكود في المقابلة

إذا عرض عليك المحاور هذا الجزء:

```ts
@Post("direct-scan")
@UseGuards(JwtAuthGuard)
@HttpCode(HttpStatus.ACCEPTED)
async directScan(@Body() body: StartScanDto, @Req() req) {
  const userId = req.user.id;
  await this.scansService.validateScanRequest(
    body.url,
    userId,
    body.deepScan ?? false,
  );

  const { jobId } = await this.queueService.addScanJob({
    url: body.url,
    userId,
    isDeepScan: body.deepScan ?? false,
  });

  return { jobId, status: "waiting" };
}
```

اشرحه بهذه الطريقة:

1. `@Post` يربط الدالة بطلب POST.
2. `JwtAuthGuard` يمنع الضيف من دخول هذا المسار ويضيف بيانات المستخدم إلى request.
3. البيانات تأتي من JSON body، وهو رابط الفحص وخيار الفحص العميق.
4. أقرأ `userId` من هوية تحقق منها الخادم، ولا آخذه من body حتى لا يستطيع العميل الادعاء بأنه مستخدم آخر.
5. أتحقق من الرابط وصلاحية الخطة قبل إدخال العمل.
6. أضيف job إلى BullMQ؛ Redis يحتفظ به حتى يسحبه Worker.
7. أرجع `202 Accepted` و`jobId`؛ هذا لا يعني اكتمال الفحص.
8. العميل يستخدم `jobId` للاستعلام عن endpoint الحالة، وعند الاكتمال يأخذ النتيجة.

ثم إذا سُئلت «لماذا لا تنفذ الفحص هنا؟»:

> لأن الاتصال بالمواقع قد يستغرق وقتًا ويفشل مؤقتًا. نقل التنفيذ إلى Worker يفصل مدة الفحص عن زمن HTTP، ويعطينا تحكمًا بالتزامن وإعادة المحاولة وحالة المهمة.

---

## 25. تمارين تطبيقية حتى تتأكد أنك فهمت

### تمرين 1: تتبع الطلب

ضع breakpoint أو logger عند:

1. `fetchScan()` في صفحة الواجهة.
2. `directScan()` في `ScansController`.
3. `addScanJob()` في `QueueService`.
4. `process()` في `ScanProcessor`.
5. `scanUrl()` في `ScansService`.
6. `prisma.scan.create()`.

راقب كيف تنتقل قيمة `url` و`userId` في كل خطوة، وأين يتغير شكل الاستجابة.

### تمرين 2: راقب شبكة المتصفح

افتح Developer Tools ثم Network:

1. أرسل فحصًا كمستخدم مسجل.
2. افتح `POST /scans/direct-scan` وشاهد `202` و`jobId`.
3. افتح طلبات `GET /scans/jobs/:jobId`.
4. راقب تغير `status` حتى `completed`.
5. قارن ذلك بـ `POST /scans/guest-scan`؛ هذا الطلب ينتظر النتيجة المباشرة.

### تمرين 3: استعلم من Prisma

بعد الفحص، تحقق من وجود:

```text
users              المستخدم
websites           الموقع المرتبط بالمستخدم
scans              الدرجة والحالة
vulnerabilities    الثغرات المرتبطة بالفحص
usage_logs          حدث الاستخدام
```

اربط الجداول باستخدام `userId`, `websiteId`, و`scanId`.

### تمرين 4: اشرح فشلًا

- `401`: افحص cookie/JWT وانتهاءه.
- `403`: افحص role أو الخطة أو حدود الاستخدام.
- `P1001`: Prisma لا يصل إلى PostgreSQL.
- ظهور `Job added` دون `Processing scan`: افحص worker وRedis واسم الطابور.
- `ETIMEDOUT` عند الفحص: الخادم لم يحصل على رد من الموقع ضمن المهلة.
- خطأ CORS في المتصفح: راجع Origin وإعداد `enableCors`؛ تذكر أن طلبات الخادم إلى الموقع الهدف لا تخضع لسياسة CORS الخاصة بالمتصفح.

إذا استطعت تنفيذ هذه التمارين وشرح كل قيمة تنتقل بين الطبقات، فأنت لا تحفظ النظرية فقط؛ أنت تتبع التنفيذ الحقيقي للمشروع.

---

## 26. AI Fix والبريد الإلكتروني

### AI Fix

المسار `POST /scans/ai-fix` محمي بـ `JwtAuthGuard`. الـ Controller يأخذ عنوان الثغرة ووصفها، ثم يستدعي:

```ts
async generateAiFix(title: string, context: string, userId?: string) {
  if (!userId) {
    throw new ForbiddenException("AI remediation is only for registered users");
  }

  const response = await this.ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Explain and fix this vulnerability:
      Vulnerability: ${title}
      Context: ${context}`,
  });

  return response.text;
}
```

الخادم يتصل بخدمة Google GenAI باستخدام `GEMINI_API_KEY`، لا المتصفح مباشرة. مفتاح API يجب أن يبقى سرًا في متغير بيئة الخادم ولا يوضع في كود الواجهة. الـ AI يرجع نصًا اقتراحيًا؛ يجب التعامل معه كمساعدة تحتاج مراجعة، وليس كإصلاح مؤكد أو تنفيذ تلقائي.

### إرسال البريد

`MailService` ينشئ Nodemailer transporter على SMTP، وتأتي بيانات الحساب من ConfigService:

```ts
this.transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: configService.get("SMTP_USER"),
    pass: configService.get("SMTP_PASS"),
  },
});
```

ثم `sendMail()` يرسل الرسالة:

```ts
await this.transporter.sendMail({
  from: mailFrom,
  to,
  subject,
  html,
});
```

المسؤوليات منفصلة:

- `AuthService` يقرر متى يرسل رمز التحقق.
- `MailService` يعرف كيف يرسل الرسالة عبر SMTP.
- `ConfigService` يقرأ إعدادات SMTP من البيئة.

### ملاحظة أمنية واقعية

في كود التطوير الحالي توجد طباعة OTP في console، وقد يطبع OTP أيضًا عند فشل البريد؛ كما أن التسجيل يعين دور admin اعتمادًا على بريد ثابت في الكود. لا تطبع OTP ولا تمنح دور المدير اعتمادًا على بريد يرسله المستخدم في الإنتاج. اجعل ترقية الدور إدارية ومن جهة موثوقة، واستخدم مولدًا عشوائيًا آمنًا لرموز التحقق، وحدّ محاولات التخمين وإعادة الإرسال.

---

## 27. تهيئة التطبيق ومتغيرات البيئة

`AppModule` هو جذر تطبيق NestJS. يجمع الوحدات ويضبط اتصالات BullMQ:

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    BullModule.forRoot({ connection: redisConnection }),
    PrismaModule,
    QueueModule,
    ScansModule,
    AuthModule,
  ],
})
export class AppModule {}
```

`ConfigModule` يجعل إعدادات البيئة متاحة للخدمات. أمثلة أسماء متغيرات يحتاجها التطبيق:

| المتغير | الغرض |
|---|---|
| `DATABASE_URL` | اتصال Prisma بقاعدة PostgreSQL |
| `DIRECT_URL` | اتصال مباشر تستخدمه Prisma في إعداد datasource |
| `REDIS_URL` | اتصال BullMQ بـ Redis |
| `JWT_SECRET` | توقيع والتحقق من JWT |
| `CLIENT_URL` | أصل الواجهة المسموح به في CORS |
| `SMTP_USER`, `SMTP_PASS` | حساب إرسال البريد |
| `MAIL_FROM` | الاسم/العنوان الظاهر كمرسل |
| `GEMINI_API_KEY` | مصادقة الخادم مع خدمة Gemini |
| `PORT`, `HOST` | عنوان ومنفذ استماع NestJS |

لا تضع القيم السرية في Git أو في ملف Markdown، ولا ترسلها في screenshots أو logs. افصل إعدادات التطوير والاختبار والإنتاج.

### ماذا يعني خطأ Prisma `P1001`؟

إذا ظهر:

```text
PrismaClientInitializationError: Can't reach database server
```

فهذا معناه أن Prisma لم يتمكن من فتح اتصال PostgreSQL عند بدء التطبيق. تحقق من host/port و`DATABASE_URL` وحالة قاعدة البيانات والشبكة. بناء TypeScript الناجح لا يثبت أن قاعدة البيانات متاحة.

### ماذا يعني خطأ Redis؟

BullMQ يعتمد على اتصال Redis. إذا تعذر الاتصال بـ Redis، فإضافة المهمة أو متابعة العامل قد تفشل. `REDIS_URL` الخاص بـ BullMQ يجب أن يكون عنوان اتصال Redis متوافقًا مع ioredis/BullMQ؛ عنوان Upstash REST مع token ليس بديلًا عن Redis protocol connection.

---

## 28. سجل الاستخدام مقابل سجل الفحوصات

من السهل الخلط بين `Scan` و`UsageLog`:

### Scan: نتيجة فحص قابلة للعرض

يخزن:

- الدرجة والحالة والتواريخ.
- رابط Website الذي جرى فحصه.
- الثغرات المرتبطة بالفحص.

هذا ما تعتمد عليه صفحة التاريخ والتصدير.

### UsageLog: حدث استخدام أو اشتراك

يخزن:

- `userId`
- `action` مثل `SCAN`, `DEEP_SCAN`, `SUBSCRIPTION_ACTIVATED`
- `createdAt`
- `metadata` أو `details` بصيغة JSON

مثال:

```ts
await this.prisma.usageLog.create({
  data: {
    userId,
    action: isDeepScan ? "DEEP_SCAN" : "SCAN",
    metadata: {
      url: formattedUrl,
      score,
      deepScan: isDeepScan,
      plan: capability.plan,
    },
  },
});
```

يستخدم `getUsageWindow()` أحداث الاستخدام لحساب عدد الفحوصات في نافذة 24 ساعة. أما حذف صف `Scan` وفق مدة الاحتفاظ فلا يعني تلقائيًا حذف كل UsageLog بالطريقة نفسها؛ لكل جدول سياسة تنظيف مختلفة.

### لماذا استخدام Database transaction مهم؟

الكود الحالي ينشئ Scan ثم ينشئ UsageLog في استدعاء منفصل. لو نجح الأول وفشل الثاني قد تصبح النتيجة محفوظة لكن عداد الاستخدام غير دقيق. عندما يجب أن تنجح عدة كتابات معًا أو تفشل معًا، استخدم transaction:

```ts
await this.prisma.$transaction(async (tx) => {
  const scan = await tx.scan.create({ data: scanData });
  await tx.usageLog.create({ data: usageData });
  return scan;
});
```

في مقابلة العمل قل: «استخدم transaction عندما تكون عدة تغييرات في قاعدة البيانات وحدة منطقية واحدة، حتى لا يبقى النظام في حالة جزئية».

---

## 29. ملاحظة عن التشغيل المجدول

`@Cron()` لا يعمل كسيرفر مستقل؛ `@nestjs/schedule` يسجل الوظيفة ضمن عملية NestJS. مثلًا:

```ts
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async processExpiredSubscriptions() {
  // ابحث عن الاشتراكات المنتهية وحدثها
}
```

معاني مهمة:

- الجدولة تستخدم توقيت الخادم ما لم يحدد timezone صراحة.
- إذا كانت هناك نسختان من التطبيق تعملان، قد تنفذ كل نسخة الـ Cron وتكرر المهمة، إلا إذا أضيف قفل/تنسيق موزع.
- يجب أن تكون المهمة قابلة للتكرار بأمان (idempotent)؛ تشغيلها مرتين لا ينبغي أن يفسد البيانات أو يكرر الدفع.
- الوظيفة المسماة cleanup يجب أن تنفذ استعلام حذف حقيقي. في `SchedulerService.cleanupOldLogs()` الحالي يتم حساب cutoff وتسجيل رسالة فقط؛ لا يوجد `deleteMany` داخلها.

---

## 30. طريقة شرح «من يملك كل مسؤولية؟»

| المسؤولية | مكانها في المشروع | مثال |
|---|---|---|
| إرسال HTTP من المتصفح | `client/lib/api.ts` وصفحة الفحص | `api.post(...)` |
| اختيار المسار وفحص الهوية | Controller + Guards | `@Post`, `@UseGuards` |
| منطق الفحص والخطة | `ScansService` | `scanUrl`, `checkUserCapability` |
| منطق خطة/اشتراك عامة | `SubscriptionService` | `activateSubscription`, `processExpiredSubscriptions` |
| حفظ وقراءة PostgreSQL | `PrismaService` وPrisma Client | `prisma.scan.create()` |
| إضافة مهمة | `QueueService` | `scanQueue.add()` |
| تنفيذ المهمة | `ScanProcessor` | `process(job)` |
| إرسال البريد | `MailService` | `transporter.sendMail()` |
| إنشاء PDF/CSV | `ExportService` | PDFKit وjson2csv |
| تسجيل المهام الدورية | خدمات عليها `@Cron()` | حذف الفحوصات القديمة/انتهاء الخطة |
| تهيئة الخادم والشبكة | `main.ts` | CORS, Helmet, cookies, port |

طريقة التذكر: **Controller يستقبل، Guard يتحقق، Service يقرر، Queue تؤجل، Worker ينفذ، Prisma يحفظ، والواجهة تعرض.**
