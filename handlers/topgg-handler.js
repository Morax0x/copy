// handlers/topgg-handler.js
const Topgg = require('@top-gg/sdk');
const express = require('express');

module.exports = (client, sql) => {
    // ⚙️ إعدادات الربط
    // ✅ تم وضع كلمة السر الخاصة بك هنا
    const WEBHOOK_PASSWORD = 'EmoraxServerVote2026'; 
    
    // ✅ تم تعديل البورت ليعمل مع Railway بشكل تلقائي
    const PORT = process.env.PORT || 3000; 
    
    // آيدي السيرفر الخاص بك
    const MY_SERVER_ID = "848921014141845544"; 

    const webhook = new Topgg.Webhook(WEBHOOK_PASSWORD);
    const app = express();

    console.log(`[Top.gg] Server Voting Handler initialized on port ${PORT}`);

    app.post('/vote', webhook.listener(async (vote) => {
        // vote.user: آيدي الشخص الذي صوت
        console.log(`✅ [Server Vote] تصويت جديد للسيرفر من العضو: ${vote.user}`);

        try {
            const userId = vote.user;

            // 🔥 الوظيفة الوحيدة: إبلاغ نظام المهام أن هذا الشخص صوت للسيرفر 🔥
            if (client.incrementQuestStats) {
                await client.incrementQuestStats(userId, MY_SERVER_ID, 'topgg_votes', 1);
                console.log(`📈 [Server Vote] تم تسجيل نقطة في مهام السيرفر للمستخدم ${userId}.`);
            }

        } catch (error) {
            console.error("❌ [Server Vote] Error processing vote:", error);
        }
    }));

    app.listen(PORT, () => {
        console.log(`🌐 [Top.gg] Listening for Server Votes on port ${PORT}`);
    });
};
