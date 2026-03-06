module.exports = (client) => {
    setInterval(async () => {
        try {
            client.guilds.cache.forEach(async (guild) => {
                guild.voiceStates.cache.forEach(async (voiceState) => {
                    const member = voiceState.member;

                    if (!member || member.user.bot || !voiceState.channelId) return;

                    const userID = member.id;
                    const guildID = guild.id;
                    const db = client.db;

                    if (!db) return;

                    try {
                        let userDataResult = await db.query("SELECT * FROM levels WHERE userid = $1 AND guildid = $2", [userID, guildID]);
                        let userData = userDataResult.rows[0];

                        if (!userData) {
                            userData = { 
                                userid: userID, 
                                guildid: guildID, 
                                xp: 0, 
                                totalxp: 0, 
                                level: 0, 
                                mora: 0, 
                                totalvctime: 0 
                            };
                            
                            await db.query(`
                                INSERT INTO levels (userid, guildid, xp, totalxp, level, mora, totalvctime)
                                VALUES ($1, $2, $3, $4, $5, $6, $7)
                            `, [userID, guildID, userData.xp, userData.totalxp, userData.level, userData.mora, userData.totalvctime]);
                        }

                        userData.totalvctime = (userData.totalvctime || 0) + 1;
                        userData.xp += 5;
                        userData.totalxp += 5;
                        userData.mora += 2;

                        let nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
                        
                        let leveledUp = false;
                        while (userData.xp >= nextXP) {
                            userData.xp -= nextXP;
                            userData.level++;
                            leveledUp = true;
                            nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
                        }

                        await db.query(`
                            UPDATE levels 
                            SET xp = $1, totalxp = $2, level = $3, mora = $4, totalvctime = $5
                            WHERE userid = $6 AND guildid = $7
                        `, [userData.xp, userData.totalxp, userData.level, userData.mora, userData.totalvctime, userID, guildID]);

                        if (client.incrementQuestStats) {
                            await client.incrementQuestStats(userID, guildID, 'vc_minutes', 1);

                            if (voiceState.streaming) {
                                await client.incrementQuestStats(userID, guildID, 'streaming_minutes', 1);
                            }
                        }

                    } catch (err) {
                        console.error(`[Voice Timer Error] User: ${userID}`, err);
                    }
                });
            });
        } catch (error) {
            console.error("[Global Voice Timer Error]", error);
        }
    }, 60 * 1000); 
};
