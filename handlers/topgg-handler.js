// handlers/topgg-handler.js
const Topgg = require('@top-gg/sdk');
const express = require('express');

module.exports = (client, sql) => {
    // ⚙️ إعدادات الربط
    const WEBHOOK_PASSWORD = 'yoursecretpassword'; // ⚠️ غيرها بنفس كلمة السر في Top.gg
    const PORT = 3000; 
    const TARGET_GUILD_ID = "848921014141845544"; // آيدي السيرفر

    const webhook = new Topgg.Webhook(WEBHOOK_PASSWORD);
    const app = express();

    console.log(`[Top.gg] Webhook Handler initialized on port ${PORT}`);

    app.post('/vote', webhook.listener(async (vote) => {
        console.log(`✅ [Top.gg] تصويت جديد من: ${vote.user}`);

        try {
            const userId = vote.user;

            // 🔥 الوظيفة الوحيدة: زيادة العداد في نظام المهام والإنجازات 🔥
            // الهاندلر هنا ما يسوي شي غير إنه يقول للسستم: "هذا الشخص صوت، زيد رقمه 1"
            // ونظام المهام هو اللي بيشيك: هل خلص اليومية؟ هل خلص الأسبوعية؟ ويعطيه الجوائز هناك.
            if (client.incrementQuestStats) {
                await client.incrementQuestStats(userId, TARGET_GUILD_ID, 'topgg_votes', 1);
                console.log(`📈 [Top.gg] تم تسجيل التصويت في نظام المهام للمستخدم ${userId}.`);
            }

        } catch (error) {
            console.error("❌ [Top.gg] Error processing vote:", error);
        }
    }));

    app.listen(PORT, () => {
        console.log(`🌐 [Top.gg] Server listening at port ${PORT}`);
    });
};
