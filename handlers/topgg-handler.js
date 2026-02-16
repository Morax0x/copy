// handlers/topgg-handler.js
const express = require('express');

module.exports = (client, sql) => {
    const PORT = process.env.PORT || 3000; 
    const MY_SERVER_ID = "848921014141845544"; 

    const app = express();

    // استقبال البيانات بصيغة JSON
    app.use(express.json());

    // مراقبة الاتصال
    app.use((req, res, next) => {
        console.log(`📨 [Webhook Traffic] ${req.method} request to ${req.path}`);
        next();
    });

    console.log(`[Top.gg] Handler initialized on port ${PORT}`);

    app.post('/vote', async (req, res) => {
        // 1. طباعة البيانات لفهم الهيكل (للتأكد فقط)
        console.log("📦 [Payload Received]:", JSON.stringify(req.body, null, 2));

        // 2. إرسال رد النجاح للموقع فوراً
        res.status(200).send({ success: true });

        try {
            const payload = req.body;
            let userId;

            // 🔥 التعديل هنا: استخراج الآيدي بذكاء حسب نوع البيانات 🔥
            
            // الحالة 1: التنسيق الجديد (الذي ظهر في اللوج عندك)
            if (payload.data && payload.data.user && payload.data.user.platform_id) {
                userId = payload.data.user.platform_id;
            }
            // الحالة 2: تنسيق Top.gg القديم (التقليدي)
            else if (payload.user) {
                // أحياناً يكون user عبارة عن ID مباشر، وأحياناً كائن
                userId = typeof payload.user === 'string' ? payload.user : payload.user.id;
            }
            // الحالة 3: بيانات داخل `vote` (تنسيقات أخرى)
            else if (payload.vote && payload.vote.user) {
                userId = payload.vote.user;
            }

            // التحقق هل وجدنا الآيدي أم لا
            if (!userId) {
                console.error("❌ [Server Vote] فشل استخراج آيدي العضو من البيانات المستلمة!");
                return;
            }

            console.log(`✅ [Server Vote] تم استخراج الآيدي بنجاح: ${userId}`);

            // 3. تنفيذ المكافأة
            if (client.incrementQuestStats) {
                // التحقق من أن العضو موجود في الداتابيس (اختياري لكن مفضل)
                // لكن incrementQuestStats تقوم باللازم عادة
                await client.incrementQuestStats(userId, MY_SERVER_ID, 'topgg_votes', 1);
                console.log(`📈 [Reward] تم تسجيل نقطة التصويت للعضو ${userId} بنجاح.`);
            }

        } catch (error) {
            console.error("❌ [Vote Error]:", error);
        }
    });

    app.get('/', (req, res) => {
        res.send('Emorax Vote Handler is Online (Fixed Payload)');
    });

    app.listen(PORT, () => {
        console.log(`🌐 [Top.gg] Listening on port ${PORT}`);
    });
};
