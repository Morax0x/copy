// handlers/voice-timer.js

module.exports = (client) => {
    // تشغيل المؤقت كل 60 ثانية (دقيقة واحدة)
    setInterval(async () => {
        try {
            // المرور على جميع السيرفرات التي يتواجد بها البوت
            client.guilds.cache.forEach(async (guild) => {
                // المرور على جميع الأعضاء المتواجدين في الرومات الصوتية حالياً
                // استخدام voiceStates أسرع وأفضل من المرور على القنوات
                guild.voiceStates.cache.forEach(async (voiceState) => {
                    const member = voiceState.member;

                    // 1. شروط الأهلية (نفس شروطك القديمة: ليس بوت + داخل روم)
                    if (!member || member.user.bot || !voiceState.channelId) return;

                    // إذا كنت تريد منع المحسب للميوت، فعل الأسطر التالية (اختياري حسب رغبتك)
                    // if (voiceState.selfMute || voiceState.serverMute) return;

                    const userID = member.id;
                    const guildID = guild.id;

                    try {
                        // 2. جلب بيانات العضو
                        let userData = client.getLevel.get(userID, guildID);
                        if (!userData) {
                            userData = { ...client.defaultData, user: userID, guild: guildID };
                        }

                        // 3. إضافة الجوائز (لكل دقيقة تمر)
                        // في الكود القديم: دقيقة واحدة = 5 XP و 2 Mora
                        userData.totalVCTime = (userData.totalVCTime || 0) + 1;
                        userData.xp += 5;
                        userData.totalXP += 5;
                        userData.mora += 2;

                        // 4. نظام اللفل أب (نفس المعادلة القديمة)
                        const nextXP = 5 * (userData.level ** 2) + (50 * userData.level) + 100;
                        if (userData.xp >= nextXP) {
                            userData.xp -= nextXP;
                            userData.level++;
                            // يمكنك إضافة رسالة تهنئة هنا إذا أردت
                        }

                        // حفظ البيانات
                        client.setLevel.run(userData);

                        // 5. تحديث المهام (Quests)
                        if (client.incrementQuestStats) {
                            // إضافة دقيقة واحدة لمهمة الصوت
                            await client.incrementQuestStats(userID, guildID, 'vc_minutes', 1);

                            // إذا كان فاتح بث، نضيف دقيقة لمهمة البث
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
    }, 60 * 1000); // 60000 ميلي ثانية = 1 دقيقة
};
