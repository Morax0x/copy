const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const Database = require('better-sqlite3');

const OWNER_ID = "1145327691772481577";

module.exports = {
    name: 'migrate-cloud',
    aliases: ['mc', 'هجرة'],
    category: "Owner",
    async execute(message, args) {
        if (message.author.id !== OWNER_ID) return;

        const db = message.client.sql;
        if (!db) return;

        const downloadUrl = "https://files.catbox.moe/kvjbvp.sqlite";
        const msg = await message.reply("⏳ **جاري سحب الملف الإمبراطوري (45 ميجا) والبدء في الهجرة...**");
        
        const tempPath = path.join(process.cwd(), `temp_migrate_${Date.now()}.sqlite`);
        const file = fs.createWriteStream(tempPath);

        try {
            const response = await axios({
                method: 'GET',
                url: downloadUrl,
                responseType: 'stream',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                timeout: 120000
            });

            response.data.pipe(file);

            file.on('finish', async function() {
                file.close();
                await msg.edit("✅ **تم السحب! جاري ضخ 125,000+ سجل في السحابة... (لا تقم بإيقاف البوت 🛑)**");

                try {
                    const sqliteDb = new Database(tempPath);
                    const tablesToMigrate = [
                        'levels', 'settings', 'streaks', 'media_streaks', 'user_daily_stats', 'user_weekly_stats', 'user_total_stats', 'user_inventory', 'user_portfolio', 'user_loans', 'user_reputation', 'user_weapons', 'user_skills', 'marriages', 'children', 'quest_notifications', 'user_quest_claims', 'user_achievements', 'market_items', 'active_giveaways', 'giveaway_entries', 'race_roles', 'user_farm'
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
                                if (err.code === '23505') successCount++; 
                                else errorCount++;
                            }
                        }
                        logDetails.push(`**${table}**: ✅ ${successCount} | ❌ ${errorCount}`);
                    }
                    sqliteDb.close();
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);

                    const embed = new EmbedBuilder()
                        .setTitle("🎉 تمت الهجرة الكبرى بنجاح!")
                        .setDescription(`تم فحص ونقل **${totalSuccess}** سجل إلى السحابة السريعة!\n\n**التفاصيل:**\n${logDetails.join('\n')}`)
                        .setColor("Green");

                    await msg.edit({ content: " ", embeds: [embed] });

                } catch (err) {
                    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
                    await msg.edit(`❌ **خطأ أثناء الهجرة:**\n\`\`\`js\n${err.message}\n\`\`\``);
                }
            });
        } catch (err) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            await msg.edit(`❌ فشل التحميل.`);
        }
    }
};
