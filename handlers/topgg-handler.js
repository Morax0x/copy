const express = require('express');

module.exports = (client, db) => {
    const PORT = process.env.PORT || 3000; 
    const MY_SERVER_ID = "848921014141845544"; 

    const app = express();

    app.use(express.json());

    app.use((req, res, next) => {
        console.log(`📨 [Webhook Traffic] ${req.method} request to ${req.path}`);
        next();
    });

    console.log(`[Top.gg] Handler initialized on port ${PORT}`);

    app.post('/vote', async (req, res) => {
        console.log("📦 [Payload Received]:", JSON.stringify(req.body, null, 2));

        res.status(200).send({ success: true });

        try {
            const payload = req.body;
            let userId;

            if (payload.data && payload.data.user && payload.data.user.platform_id) {
                userId = payload.data.user.platform_id;
            }
            else if (payload.user) {
                userId = typeof payload.user === 'string' ? payload.user : payload.user.id;
            }
            else if (payload.vote && payload.vote.user) {
                userId = payload.vote.user;
            }

            if (!userId) {
                console.error("❌ [Server Vote] فشل استخراج آيدي العضو من البيانات المستلمة!");
                return;
            }

            console.log(`✅ [Server Vote] تم استخراج الآيدي بنجاح: ${userId}`);

            if (client.incrementQuestStats) {
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
