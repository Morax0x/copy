const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const Database = require('better-sqlite3');

const OWNER_ID = "1145327691772481577"; // آيدي الإمبراطور

module.exports = {
    name: 'migrate-cloud',
    aliases: ['mc', 'هجرة'],
    description: 'رفع ملف SQLite القديم وضخ بياناته إلى السحابة',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const db = client.sql; 
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        // ⚡ سحب الرابط من المرفقات أو من النص مباشرة
        let downloadUrl = "";
        if (message.attachments.size > 0) {
            downloadUrl = message.attachments.first().url;
        } else if (args[0] && args[0].startsWith('http')) {
            downloadUrl = args[0];
        }

        if (!downloadUrl) {
            return message.reply("⚠️ **أيها الإمبراطور، يرجى إرفاق الملف أو وضع رابط مباشر للملف بعد الأمر.**\nمثال: `-mc https://files.catbox.moe/xyz.sqlite`");
        }

        const msg = await message.reply("⏳ **جاري تحميل ملف البيانات إلى البوت (الملف كبير، قد يستغرق دقيقة)...**");
        const tempPath = path.join(process.cwd(), `temp_migrate_${Date.now()}.sqlite`);
        const file = fs.createWriteStream(tempPath);

        const requestModule = downloadUrl.startsWith('https') ? https : http;

        requestModule.get(downloadUrl, function(response) {
            if (response.statusCode === 301 || response.statusCode === 302) {
                 return msg.edit("❌ فشل التحميل: الرابط غير مباشر. يرجى استخدام موقع مثل catbox.moe للحصول على رابط مباشر.");
            }

            response.pipe(file);

            file.on('finish', async function() {
                file.close();
                await msg.edit("✅ **تم سحب الملف بنجاح! جاري بدء الهجرة الكبرى إلى السحابة... (لا تقم بإيقاف البوت 🛑)**");

                try {
                    const sqliteDb = new Database(tempPath);

                    const tablesToMigrate = [
                        'levels', 'settings', 'streaks', 'media_streaks',
                        'user_daily_stats', 'user_weekly_stats', 'user_total_stats',
                        'user_inventory', 'user_portfolio', 'user_loans',
                        'user_reputation', 'user_weapons', 'user_skills',
                        'marriages', 'children', 'quest_notifications',
                        'user_quest_claims', 'user_achievements', 'market_items',
                        'active_giveaways', 'giveaway_entries', 'race_roles', 'user_farm'
                    ];

                    let totalSuccess = 0;
                    let logDetails = [];

                    for (const table of tablesToMigrate) {
                        const checkTable = sqliteDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
                        if (!checkTable) continue;

                        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
                        if (rows.length === 0) continue;

                        const columns = Object.keys(rows[0]);
                        const colsString = columns.map(c => `"${c.toLowerCase()}"`).join(', ');
                        
                        let successCount = 0;
                        let errorCount = 0;

                        for (const row of rows) {
                            const values = columns.map(col => row[col]);
                            const valsString = columns.map((_, i) => `$${i + 1}`).join(', ');
                            
                            try {
                                await db.query(`INSERT INTO "${table}" (${colsString}) VALUES (${valsString}) ON CONFLICT DO NOTHING`, values);
                                successCount++;
                                totalSuccess++;
                            } catch (err) {
                                if (err.code === '23505') { // موجود مسبقاً
                                    successCount++; 
                                } else {
                                    errorCount++;
                                }
                            }
                        }
                        logDetails.push(`**${table}**: ✅ ${successCount} | ❌ ${errorCount}`);
                    }

                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                    const embed = new EmbedBuilder()
                        .setTitle("🎉 تمت الهجرة الكبرى بنجاح!")
                        .setDescription(`تم فحص ونقل **${totalSuccess}** سجل إلى السحابة السريعة!\n\n**التفاصيل:**\n${logDetails.join('\n')}`)
                        .setColor("Green")
                        .setFooter({ text: "بيانات الإمبراطورية الآن آمنة وسريعة كالبرق!" });

                    await msg.edit({ content: " ", embeds: [embed] });

                } catch (err) {
                    console.error("Migration Fatal Error:", err);
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    await msg.edit(`❌ **حدث خطأ فادح أثناء الهجرة:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }
            });
        }).on('error', function(err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            msg.edit(`❌ فشل تحميل الملف من الرابط: ${err.message}`);
        });
    }
};
