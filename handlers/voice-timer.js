const { calculateRequiredXP } = require('./handler-utils.js');

module.exports = (client) => {
    setInterval(async () => {
        try {
            client.guilds.cache.forEach(async (guild) => {
                guild.voiceStates.cache.forEach(async (voiceState) => {
                    const member = voiceState.member;

                    // تجاهل البوتات ومن ليس في روم صوتي
                    if (!member || member.user.bot || !voiceState.channelId) return;

                    const userID = member.id;
                    const guildID = guild.id;
                    const db = client.sql; 

                    if (!db) return;

                    try {
                        // 🔥 التحديث الآمن: القراءة من الكاش لمنع التضارب مع رسائل الشات 🔥
                        let userData = null;
                        if (client.getLevel) {
                            userData = await client.getLevel(userID, guildID);
                        }

                        // إذا لم يكن موجوداً في الكاش، نجلبه من قاعدة البيانات
                        if (!userData) {
                            let userDataResult = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [userID, guildID]);
                            userData = userDataResult.rows[0];

                            if (!userData) {
                                userData = { 
                                    user: userID, 
                                    guild: guildID, 
                                    xp: 0, 
                                    totalXP: 0, 
                                    level: 1, // البداية دائماً لفل 1
                                    mora: 0, 
                                    totalVCTime: 0 
                                };
                                
                                await db.query(`
                                    INSERT INTO levels ("user", "guild", "xp", "totalXP", "level", "mora", "totalVCTime")
                                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                                `, [userID, guildID, userData.xp, userData.totalXP, userData.level, userData.mora, userData.totalVCTime]).catch(()=>{});
                            }
                        }

                        // 🔥 الحل الجذري لمنع التخمينات ودمج النصوص (مثل تحول لفل 40 إلى 401) 🔥
                        userData.totalVCTime = (Number(userData.totalVCTime || userData.totalvctime) || 0) + 1;
                        userData.xp = (Number(userData.xp) || 0) + 5;
                        userData.totalXP = (Number(userData.totalXP || userData.totalxp) || 0) + 5;
                        userData.mora = (Number(userData.mora) || 0) + 2;
                        userData.level = Number(userData.level) || 1;

                        // جلب الـ XP المطلوب للفل القادم باستخدام دالة الصعوبة الجديدة
                        let nextXP = calculateRequiredXP(userData.level);
                        
                        // 🔥 استخدام While Loop للتلفيل المتعدد بأمان في حال اكتسب خبرة ضخمة 🔥
                        let leveledUp = false;
                        while (userData.xp >= nextXP) {
                            userData.xp -= nextXP;
                            userData.level++;
                            leveledUp = true;
                            nextXP = calculateRequiredXP(userData.level);
                        }

                        // 🔥 التحديث الآمن باستخدام الكاش لتفادي مسح البيانات التي جُمعت من الشات 🔥
                        if (client.setLevel) {
                            await client.setLevel(userData);
                        } else {
                            // كود احتياطي في حال كان الكاش غير متوفر
                            await db.query(`
                                UPDATE levels 
                                SET "xp" = $1, "totalXP" = $2, "level" = $3, "mora" = $4, "totalVCTime" = $5
                                WHERE "user" = $6 AND "guild" = $7
                            `, [userData.xp, userData.totalXP, userData.level, userData.mora, userData.totalVCTime, userID, guildID]);
                        }

                        // تحديث مهام الوقت الصوتي
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
    }, 60 * 1000); // يتكرر كل دقيقة (60,000 ملي ثانية)
};
