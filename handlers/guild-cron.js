const cron = require('node-cron');
const { EmbedBuilder, Colors } = require('discord.js');

function startGuildCrons(client, db) {
    if (!db) return;

    cron.schedule('59 23 * * *', async () => {
        console.log("[Guild Cron] Starting Daily Reset for Kings...");
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            const settingsRes = await db.query("SELECT * FROM settings WHERE guild = $1", [guild.id]);
            const settings = settingsRes.rows[0];
            if (!settings || !settings.guildannouncechannelid) return;

            const announceChannel = guild.channels.cache.get(settings.guildannouncechannelid);
            if (!announceChannel) return;

            const casinoDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND (COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) > 0 ORDER BY (COALESCE(casino_profit, 0) + COALESCE(mora_earned, 0)) DESC LIMIT 1`, [guild.id, todayStr]);
            const casinoData = casinoDataRes.rows[0];
            
            const abyssDataRes = await db.query(`SELECT userid FROM levels WHERE guildid = $1 AND max_dungeon_floor > 0 ORDER BY max_dungeon_floor DESC LIMIT 1`, [guild.id]);
            const abyssData = abyssDataRes.rows[0];
            
            const chatterDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(messages, 0) > 0 ORDER BY COALESCE(messages, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const chatterData = chatterDataRes.rows[0];
            
            const philanDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(mora_donated, 0) > 0 ORDER BY COALESCE(mora_donated, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const philanData = philanDataRes.rows[0];
            
            const advisorDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(ai_interactions, 0) > 0 ORDER BY COALESCE(ai_interactions, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const advisorData = advisorDataRes.rows[0];
            
            const fisherDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(fish_caught, 0) > 0 ORDER BY COALESCE(fish_caught, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const fisherData = fisherDataRes.rows[0];
            
            const pvpDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(pvp_wins, 0) > 0 ORDER BY COALESCE(pvp_wins, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const pvpData = pvpDataRes.rows[0];
            
            const farmDataRes = await db.query(`SELECT userid FROM kings_board_tracker WHERE guildid = $1 AND date = $2 AND COALESCE(crops_harvested, 0) > 0 ORDER BY COALESCE(crops_harvested, 0) DESC LIMIT 1`, [guild.id, todayStr]);
            const farmData = farmDataRes.rows[0];

            const userRewards = {};
            
            if (chatterData && chatterData.userid) userRewards[chatterData.userid] = (userRewards[chatterData.userid] || 0) + 7; 
            if (casinoData && casinoData.userid) userRewards[casinoData.userid] = (userRewards[casinoData.userid] || 0) + 5; 
            if (abyssData && abyssData.userid) userRewards[abyssData.userid] = (userRewards[abyssData.userid] || 0) + 4; 
            if (pvpData && pvpData.userid) userRewards[pvpData.userid] = (userRewards[pvpData.userid] || 0) + 3; 
            if (advisorData && advisorData.userid) userRewards[advisorData.userid] = (userRewards[advisorData.userid] || 0) + 2; 
            if (fisherData && fisherData.userid) userRewards[fisherData.userid] = (userRewards[fisherData.userid] || 0) + 2; 
            if (farmData && farmData.userid) userRewards[farmData.userid] = (userRewards[farmData.userid] || 0) + 2; 
            if (philanData && philanData.userid) userRewards[philanData.userid] = (userRewards[philanData.userid] || 0) + 1; 

            if (Object.keys(userRewards).length > 0) {
                let kingsMentions = [];
                
                try {
                    await db.query("BEGIN");
                    for (const [kingId, reward] of Object.entries(userRewards)) {
                        await db.query("INSERT INTO user_reputation (userid, guildid, rep_points) VALUES ($1, $2, $3) ON CONFLICT(userid, guildid) DO UPDATE SET rep_points = user_reputation.rep_points + $4", [kingId, guild.id, reward, reward]);
                        kingsMentions.push(`🎖️ <@${kingId}> (**+${reward}** سمعة)`);
                    }
                    await db.query("COMMIT");
                } catch (e) {
                    await db.query("ROLLBACK");
                    console.error("[Guild Cron] Daily Reset DB Error:", e);
                }

                const embed = new EmbedBuilder()
                    .setTitle('🌙 انتهى اليوم بسلام!')
                    .setDescription(`تمت مكافأة ملوك اليوم بنقاط سمعة متفاوتة حسب قوة وثقل ألقابهم، لصمودهم حتى النهاية!\n\n👑 **ملوك اليوم العظماء ومكافآتهم:**\n${kingsMentions.join('\n')}`)
                    .setColor(Colors.Gold);
                
                await announceChannel.send({ embeds: [embed] }).catch(()=>{});
            }
        });
    }, { timezone: "Asia/Riyadh" });

    cron.schedule('59 23 * * 5', async () => {
        console.log("[Guild Cron] Starting Silent Weekly Elite Tax...");
        
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
        const diff = now.getDate() - (now.getDay() + 2) % 7; 
        const friday = new Date(now.setDate(diff)); 
        const weekStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(friday);

        const guilds = client.guilds.cache;

        guilds.forEach(async (guild) => {
            const elitesRes = await db.query("SELECT * FROM user_reputation WHERE guildid = $1 AND rep_points >= 100", [guild.id]);
            const elites = elitesRes.rows;
            
            if (elites.length === 0) return;

            try {
                await db.query("BEGIN");
                for (const elite of elites) {
                    const points = parseInt(elite.rep_points) || 0;
                    const userId = elite.userid;
                    const repsGiven = parseInt(elite.weekly_reps_given) || 0;

                    const weeklyStatsRes = await db.query("SELECT messages FROM user_weekly_stats WHERE userid = $1 AND guildid = $2 AND weekstartdate = $3", [userId, guild.id, weekStr]);
                    const weeklyStats = weeklyStatsRes.rows[0];
                    const msgs = weeklyStats ? (parseInt(weeklyStats.messages) || 0) : 0;

                    let penalty = 0;

                    if (points >= 1000) { 
                        if (msgs < 1000 || repsGiven < 5) penalty = 10;
                    } else if (points >= 500) { 
                        if (msgs < 800 || repsGiven < 3) penalty = 5;
                    } else if (points >= 250) { 
                        if (msgs < 400) penalty = 3;
                    } else if (points >= 100) { 
                        if (msgs < 150) penalty = 1;
                    }

                    if (penalty > 0) {
                        const newPoints = Math.max(0, points - penalty);
                        await db.query("UPDATE user_reputation SET rep_points = $1 WHERE userid = $2 AND guildid = $3", [newPoints, userId, guild.id]);
                    }
                }

                await db.query("UPDATE user_reputation SET weekly_reps_given = 0 WHERE guildid = $1", [guild.id]);
                await db.query("COMMIT");
            } catch (e) {
                await db.query("ROLLBACK");
                console.error("[Guild Cron] Weekly Elite Tax DB Error:", e);
            }
            
            console.log(`[Guild Cron] Weekly Elite Tax completed silently for guild: ${guild.id}`);
        });
    }, { timezone: "Asia/Riyadh" });
}

module.exports = { startGuildCrons };
