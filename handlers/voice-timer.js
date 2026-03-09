module.exports = (client) => {
    setInterval(async () => {
        try {
            client.guilds.cache.forEach(async (guild) => {
                guild.voiceStates.cache.forEach(async (voiceState) => {
                    const member = voiceState.member;

                    if (!member || member.user.bot || !voiceState.channelId) return;

                    const userID = member.id;
                    const guildID = guild.id;
                    const db = client.sql; // 🔥 تم التصحيح إلى client.sql

                    if (!db) return;

                    try {
                        // 🔥 تم تصحيح أسماء الأعمدة إلى "user" و guild
                        let userDataResult = await db.query('SELECT * FROM levels WHERE "user" = $1 AND guild = $2', [userID, guildID]);
                        let userData = userDataResult.rows[0];

                        if (!userData) {
                            userData = { 
                                user: userID, 
                                guild: guildID, 
                                xp: 0, 
                                totalxp: 0, 
                                level: 0, 
                                mora: 0, 
                                totalvctime: 0 
                            };
                            
                            await db.query(`
                                INSERT INTO levels ("user", guild, xp, totalxp, level, mora, totalvctime)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                            `, [userID, guildID, userData.xp, userData.totalxp, userData.level, userData.mora, userData.totalvctime]);
                        }

                        // 🔥 إضافة parseInt لضمان حساب الأرقام بشكل صحيح وتجنب الأخطاء النصية
                        userData.totalvctime = (parseInt(userData.totalvctime) || 0) + 1;
                        userData.xp = (parseInt(userData.xp) || 0) + 5;
                        userData.totalxp = (parseInt(userData.totalxp) || 0) + 5;
                        userData.mora = (parseInt(userData.mora) || 0) + 2;
                        userData.level = parseInt(userData.level) || 0;

                        let nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
                        
                        let leveledUp = false;
                        while (userData.xp >= nextXP) {
                            userData.xp -= nextXP;
                            userData.level++;
                            leveledUp = true;
                            nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
                        }

                        // 🔥 تم تصحيح أسماء الأعمدة في أمر التحديث
                        await db.query(`
                            UPDATE levels 
                            SET xp = $1, totalxp = $2, level = $3, mora = $4, totalvctime = $5
                            WHERE "user" = $6 AND guild = $7
                        `, [userData.xp, userData.totalxp, userData.level, userData.mora, userData.totalvctime, userID, guildID]);

                        if (client.incrementQuestStats) {
                            await client.incrementQuestStats(userID, guildID, 'vc_minutes', 1).catch(()=>{});

                            if (voiceState.streaming) {
                                await client.incrementQuestStats(userID, guildID, 'streaming_minutes', 1).catch(()=>{});
                            }
                        }

                    } catch (err) {
                        console.error(`[Voice Timer Error] User: ${userID}`, err.message);
                    }
                });
            });
        } catch (error) {
            console.error("[Global Voice Timer Error]", error.message);
        }
    }, 60 * 1000); 
};
