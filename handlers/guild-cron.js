// handlers/guild-cron.js

const cron = require('node-cron');
const { EmbedBuilder, Colors } = require('discord.js');

function startGuildCrons(client, sql) {

    // =========================================================
    // 1. التصفير اليومي (كل يوم الساعة 23:59 بتوقيت مكة)
    // يكافئ الملوك بنقاط سمعة مخصصة لكل عرش
    // =========================================================
    cron.schedule('59 23 * * *', async () => {
        console.log("[Guild Cron] Starting Daily Reset for Kings...");
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            const settings = sql.prepare("SELECT * FROM settings WHERE guild = ?").get(guild.id);
            if (!settings || !settings.guildAnnounceChannelID) return;

            const announceChannel = guild.channels.cache.get(settings.guildAnnounceChannelID);
            if (!announceChannel) return;

            // جلب الملوك الثمانية لليوم من الجدول المعزول
            const casinoData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND (CAST(COALESCE(casino_profit, 0) AS INTEGER) + CAST(COALESCE(mora_earned, 0) AS INTEGER)) > 0 ORDER BY (CAST(COALESCE(casino_profit, 0) AS INTEGER) + CAST(COALESCE(mora_earned, 0) AS INTEGER)) DESC LIMIT 1`).get(guild.id, todayStr);
            const abyssData = sql.prepare(`SELECT user AS userID FROM levels WHERE guild = ? AND CAST(max_dungeon_floor AS INTEGER) > 0 ORDER BY CAST(max_dungeon_floor AS INTEGER) DESC LIMIT 1`).get(guild.id);
            const chatterData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(messages, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(messages, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);
            const philanData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(mora_donated, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(mora_donated, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);
            const advisorData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(ai_interactions, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(ai_interactions, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);
            const fisherData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(fish_caught, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(fish_caught, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);
            const pvpData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(pvp_wins, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(pvp_wins, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);
            const farmData = sql.prepare(`SELECT userID FROM kings_board_tracker WHERE guildID = ? AND date = ? AND CAST(COALESCE(crops_harvested, 0) AS INTEGER) > 0 ORDER BY CAST(COALESCE(crops_harvested, 0) AS INTEGER) DESC LIMIT 1`).get(guild.id, todayStr);

            // تجميع المكافآت المخصصة
            const userRewards = {};
            
            if (chatterData && chatterData.userID) userRewards[chatterData.userID] = (userRewards[chatterData.userID] || 0) + 7; 
            if (casinoData && casinoData.userID) userRewards[casinoData.userID] = (userRewards[casinoData.userID] || 0) + 5; 
            if (abyssData && abyssData.userID) userRewards[abyssData.userID] = (userRewards[abyssData.userID] || 0) + 4; 
            if (pvpData && pvpData.userID) userRewards[pvpData.userID] = (userRewards[pvpData.userID] || 0) + 3; 
            if (advisorData && advisorData.userID) userRewards[advisorData.userID] = (userRewards[advisorData.userID] || 0) + 2; 
            if (fisherData && fisherData.userID) userRewards[fisherData.userID] = (userRewards[fisherData.userID] || 0) + 2; 
            if (farmData && farmData.userID) userRewards[farmData.userID] = (userRewards[farmData.userID] || 0) + 2; 
            if (philanData && philanData.userID) userRewards[philanData.userID] = (userRewards[philanData.userID] || 0) + 1; 

            if (Object.keys(userRewards).length > 0) {
                let kingsMentions = [];
                sql.transaction(() => {
                    for (const [kingId, reward] of Object.entries(userRewards)) {
                        sql.prepare("INSERT INTO user_reputation (userID, guildID, rep_points) VALUES (?, ?, ?) ON CONFLICT(userID, guildID) DO UPDATE SET rep_points = CAST(rep_points AS INTEGER) + ?").run(kingId, guild.id, reward, reward);
                        kingsMentions.push(`🎖️ <@${kingId}> (**+${reward}** سمعة)`);
                    }
                })();

                const embed = new EmbedBuilder()
                    .setTitle('🌙 انتهى اليوم بسلام!')
                    .setDescription(`تمت مكافأة ملوك اليوم بنقاط سمعة متفاوتة حسب قوة وثقل ألقابهم، لصمودهم حتى النهاية!\n\n👑 **ملوك اليوم العظماء ومكافآتهم:**\n${kingsMentions.join('\n')}`)
                    .setColor(Colors.Gold);
                
                await announceChannel.send({ embeds: [embed] }).catch(()=>{});
            }
        });
    }, { timezone: "Asia/Riyadh" });

    // =========================================================
    // 2. التصفير الأسبوعي (الضريبة) (يوم الجمعة 23:59 بتوقيت مكة)
    // يعمل في الخلفية بصمت تام بدون إرسال أي رسائل.
    // =========================================================
    cron.schedule('59 23 * * 5', async () => {
        console.log("[Guild Cron] Starting Silent Weekly Elite Tax...");
        
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        const diff = now.getDate() - (now.getDay() + 2) % 7; 
        const friday = new Date(now.setDate(diff)); 
        const weekStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);

        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            const elites = sql.prepare("SELECT * FROM user_reputation WHERE guildID = ? AND CAST(rep_points AS INTEGER) >= 100").all(guild.id);
            
            if (elites.length === 0) return;

            sql.transaction(() => {
                for (const elite of elites) {
                    const points = parseInt(elite.rep_points) || 0;
                    const userId = elite.userID;
                    const repsGiven = parseInt(elite.weekly_reps_given) || 0;

                    const weeklyStats = sql.prepare("SELECT messages FROM user_weekly_stats WHERE userID = ? AND guildID = ? AND weekStartDate = ?").get(userId, guild.id, weekStr);
                    const msgs = weeklyStats ? (parseInt(weeklyStats.messages) || 0) : 0;

                    let penalty = 0;

                    if (points >= 1000) { // SS
                        if (msgs < 1000 || repsGiven < 5) penalty = 10;
                    } else if (points >= 500) { // S
                        if (msgs < 800 || repsGiven < 3) penalty = 5;
                    } else if (points >= 250) { // A
                        if (msgs < 400) penalty = 3;
                    } else if (points >= 100) { // B
                        if (msgs < 150) penalty = 1;
                    }

                    if (penalty > 0) {
                        const newPoints = Math.max(0, points - penalty);
                        sql.prepare("UPDATE user_reputation SET rep_points = ? WHERE userID = ? AND guildID = ?").run(newPoints, userId, guild.id);
                    }
                }

                // تصفير عداد المساعدة الأسبوعي بهدوء
                sql.prepare("UPDATE user_reputation SET weekly_reps_given = 0 WHERE guildID = ?").run(guild.id);
            })();
            
            console.log(`[Guild Cron] Weekly Elite Tax completed silently for guild: ${guild.id}`);
        });
    }, { timezone: "Asia/Riyadh" });
}

module.exports = { startGuildCrons };
