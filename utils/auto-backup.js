const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

async function startAutoBackup(client) {
    // 60 دقيقة * 60 ثانية * 1000 جزء من الثانية = 1 ساعة
    const HOURLY_INTERVAL = 60 * 60 * 1000; 

    setInterval(async () => {
        const db = client.sql;
        if (!db) return;

        try {
            // 1. جلب آيدي القناة من قاعدة البيانات (التي حددتها بأمر sss)
            let configRes;
            try { configRes = await db.query(`SELECT "value" FROM bot_config WHERE "key" = 'backup_channel'`); }
            catch (e) { configRes = await db.query(`SELECT value FROM bot_config WHERE key = 'backup_channel'`).catch(()=>({rows:[]})); }
            
            const backupChannelId = configRes.rows[0]?.value;
            if (!backupChannelId) return; // إذا لم يتم تحديد القناة بعد، توقف بصمت

            const channel = client.channels.cache.get(backupChannelId);
            if (!channel) return; // إذا تم حذف القناة، توقف بصمت

            // 2. تجهيز البيانات
            const tables = ['levels', 'settings', 'streaks', 'user_reputation', 'user_weapons', 'user_inventory', 'marriages', 'children', 'active_giveaways', 'user_achievements', 'kings_board_tracker', 'user_daily_stats', 'user_weekly_stats'];
            let backupData = {};

            for (const table of tables) {
                try {
                    const res = await db.query(`SELECT * FROM ${table}`);
                    backupData[table] = res.rows;
                } catch (e) {
                    // تجاهل الجداول غير الموجودة
                } 
            }

            // 3. إنشاء الملف مؤقتاً
            const dateStr = new Date().toISOString().replace(/T/, '_').replace(/:/g, '-').split('.')[0];
            const fileName = `AutoCloudBackup_${dateStr}.json`;
            const filePath = path.join(process.cwd(), fileName);
            
            fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2));
            const stats = fs.statSync(filePath);
            const fileSizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

            const attachment = new AttachmentBuilder(filePath, { name: fileName });

            // 4. إرسال الملف للقناة
            await channel.send({ 
                content: `📦 **نسخ احتياطي تلقائي (سحابي)**\n📊 **حجم البيانات:** ${fileSizeInMB} MB\n⏰ **الوقت:** <t:${Math.floor(Date.now() / 1000)}:F>`, 
                files: [attachment] 
            });

            // 5. حذف الملف من السيرفر بعد الإرسال لكي لا يمتلئ السيرفر
            fs.unlinkSync(filePath);

        } catch (err) {
            console.error("[Auto Backup Error]:", err.message);
        }
    }, HOURLY_INTERVAL);
}

module.exports = { startAutoBackup };
