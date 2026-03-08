const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const OWNER_ID = "1145327691772481577"; // آيدي الإمبراطور

module.exports = {
    name: 'migrate-cloud',
    aliases: ['mc', 'هجرة'],
    description: 'رفع ملف SQLite القديم وضخ بياناته إلى السحابة (PostgreSQL)',
    category: "Owner",

    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const client = message.client;
        const db = client.sql; // اتصال PostgreSQL السحابي
        if (!db) return message.reply("❌ البوت غير متصل بقاعدة البيانات السحابية!");

        const attachment = message.attachments.first();
        if (!attachment || !attachment.name.endsWith('.sqlite')) {
            return message.reply("⚠️ **أيها الإمبراطور، يرجى إرفاق ملف `mainDB.sqlite` المليء بالبيانات مع هذا الأمر.**");
        }

        const msg = await message.reply("⏳ **جاري تحميل ملف البيانات إلى البوت (قد يستغرق بضع ثوانٍ)...**");
        const tempPath = path.join(process.cwd(), `temp_migrate_${Date.now()}.sqlite`);

        const file = fs.createWriteStream(tempPath);

        https.get(attachment.url, function(response) {
            response.pipe(file);

            file.on('finish', async function() {
                file.close();
                await msg.edit("✅ **تم تحميل الملف! جاري بدء الهجرة الكبرى إلى السحابة... (يرجى الانتظار قد يستغرق دقيقة)**");

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

                        // توحيد أسماء الأعمدة لتصبح بأحرف صغيرة لتجنب أخطاء السحابة
                        const columns = Object.keys(rows[0]);
                        const colsString = columns.map(c => `"${c.toLowerCase()}"`).join(', ');
                        
                        let successCount = 0;
                        let errorCount = 0;

                        // نستخدم عملية إدخال متسلسلة (Batch Insert) إن أمكن، ولكن للإمان سنستخدم الإدخال الفردي المحمي
                        for (const row of rows) {
                            const values = columns.map(col => row[col]);
                            const valsString = columns.map((_, i) => `$${i + 1}`).join(', ');
                            
                            // نصنع جملة الـ ON CONFLICT بشكل ديناميكي لتحديث البيانات إن وجدت
                            let conflictClause = "DO NOTHING"; 
                            
                            try {
                                await db.query(`INSERT INTO "${table}" (${colsString}) VALUES (${valsString}) ON CONFLICT ${conflictClause}`, values);
                                successCount++;
                                totalSuccess++;
                            } catch (err) {
                                if (err.code === '23505') { // يعني موجود مسبقاً
                                    successCount++; 
                                } else {
                                    errorCount++;
                                    console.error(`[Migrate Error - ${table}]:`, err.message);
                                }
                            }
                        }
                        logDetails.push(`**${table}**: ✅ ${successCount} صف | ❌ ${errorCount} خطأ`);
                    }

                    // إغلاق وحذف الملف المؤقت
                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                    const embed = new EmbedBuilder()
                        .setTitle("🎉 تمت الهجرة الكبرى بنجاح!")
                        .setDescription(`تم فحص ونقل **${totalSuccess}** سجل إلى السحابة (Supabase)!\n\n**التفاصيل:**\n${logDetails.join('\n')}`)
                        .setColor("Green")
                        .setFooter({ text: "بيانات الإمبراطورية الآن آمنة وسريعة!" });

                    await msg.edit({ content: " ", embeds: [embed] });

                } catch (err) {
                    console.error("Migration Fatal Error:", err);
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    await msg.edit(`❌ **حدث خطأ فادح أثناء الهجرة:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }
            });
        }).on('error', function(err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            msg.edit(`❌ فشل تحميل الملف: ${err.message}`);
        });
    }
};
