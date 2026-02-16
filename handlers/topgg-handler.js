// handlers/topgg-handler.js
const express = require('express');

module.exports = (client, sql) => {
    const PORT = process.env.PORT || 3000; 
    const MY_SERVER_ID = "848921014141845544"; 

    const app = express();

    // 1. ضروري جداً لاستقبال البيانات (بديل عن مكتبة Top.gg مؤقتاً)
    app.use(express.json());

    // 2. مراقبة أي اتصال
    app.use((req, res, next) => {
        console.log(`📨 [Webhook Traffic] ${req.method} request to ${req.path}`);
        next();
    });

    console.log(`[Top.gg] Debug Handler initialized on port ${PORT}`);

    // 3. استقبال التصويت (بدون كلمة سر)
    app.post('/vote', async (req, res) => {
        // طباعة البيانات القادمة من الموقع للتأكد
        console.log("📦 [Payload Received]:", req.body);

        // إرسال رد "ناجح" للموقع فوراً ليظهر الزر الأخضر
        res.status(200).send({ success: true });

        try {
            // بيانات التصويت عادة تكون في req.body
            // user: آيدي الشخص
            // type: "upvote"
            const vote = req.body;

            if (vote.type === 'test') {
                console.log(`🧪 [Test Vote] تجربة ناجحة! الموقع متصل بالبوت.`);
                return;
            }

            const userId = vote.user;
            console.log(`✅ [Server Vote] تصويت حقيقي من: ${userId}`);

            // تنفيذ المكافأة
            if (client.incrementQuestStats) {
                await client.incrementQuestStats(userId, MY_SERVER_ID, 'topgg_votes', 1);
                console.log(`📈 [Reward] تم تسجيل النقطة.`);
            }

        } catch (error) {
            console.error("❌ [Vote Error]:", error);
        }
    });

    // صفحة تأكيد التشغيل
    app.get('/', (req, res) => {
        res.send('Emorax Vote Handler is Online (No Auth Mode)');
    });

    app.listen(PORT, () => {
        console.log(`🌐 [Top.gg] Listening on port ${PORT}`);
    });
};
