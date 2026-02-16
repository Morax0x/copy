// handlers/ai-handler.js

const config = require('../config.json');
const { getUserData, getDynamicServerData } = require('./ai/knowledge');
const { getLeaderboardKnowledge } = require('./ai/serverLore'); 
const { buildSystemPrompt } = require('./ai/persona');
const { generateResponse } = require('./ai/engine');
const aiConfig = require('../utils/aiConfig'); 
const { checkSecurity } = require('./ai/security'); 
require('dotenv').config();

const SQLite = require("better-sqlite3");
const path = require('path');
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

// 🔥 الآيدي الخاص بك (الإمبراطور) - لن تعمل الأوامر إلا لك
const OWNER_ID = "1145327691772481577"; 

/**
 * 🧹 دالة تنظيف النص
 */
function sanitizeOutput(text) {
    if (!text) return "";
    let cleanText = text.replace(/<@!?\d+>/g, "");
    cleanText = cleanText.replace(/@/g, "");
    cleanText = cleanText.replace(/(.)\1{3,}/g, "$1$1$1");
    return cleanText.trim();
}

/**
 * 🛠️ دالة مساعدة لتحويل الآيديات إلى أسماء
 */
async function resolveNames(guild, dataList) {
    if (!dataList || dataList.length === 0) return "لا يوجد بيانات";
    const names = [];
    for (const item of dataList) {
        try {
            const member = await guild.members.fetch(item.user).catch(() => null);
            const name = member ? member.displayName : "شبح مغادر";
            const val = item.level || item.total; 
            names.push(`${name} (${val})`);
        } catch(e) {}
    }
    return names.join(', ');
}

/**
 * 🤖 دالة: تنفيذ الأوامر الإدارية (السكرتيرة)
 * تعمل فقط للأونر وتنفذ الأوامر بناءً على الكلمات المفتاحية
 */
async function detectAndExecuteCommands(message, aiResponseText) {
    if (!message || message.author.id !== OWNER_ID) return aiResponseText;

    const lowerText = message.content.toLowerCase();
    let feedback = ""; 
    let actionDone = false;

    try {
        // === 1. أوامر المورا (إعطاء / سحب) ===
        // الكلمات المفتاحية: اعط، حول، هاتي، اسحب
        if (lowerText.includes('اعط') || lowerText.includes('حول') || lowerText.includes('هاتي') || lowerText.includes('سحب') || lowerText.includes('اسحب')) {
            const targetUser = message.mentions.users.first();
            const amountMatch = lowerText.match(/(\d+|[\u0660-\u0669]+)/); // البحث عن أي رقم

            if (targetUser && amountMatch) {
                // تحويل الأرقام العربية إلى إنجليزية
                let amount = parseInt(amountMatch[0].replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
                
                if (!isNaN(amount) && amount > 0) {
                    const isGive = !lowerText.includes('سحب') && !lowerText.includes('اسحب'); // افتراضياً إعطاء إلا لو ذكر السحب
                    
                    // تجهيز الداتابيس
                    let userLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(targetUser.id, message.guild.id);
                    if (!userLevel) {
                        sql.prepare("INSERT OR IGNORE INTO levels (user, guild, xp, level, totalXP, mora) VALUES (?, ?, 0, 1, 0, 0)").run(targetUser.id, message.guild.id);
                    }

                    if (isGive) {
                        sql.prepare("UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?").run(amount, targetUser.id, message.guild.id);
                        await message.react('💸').catch(()=>{});
                        feedback = `\n\n[System]: ✅ **تم التنفيذ:** تم تحويل **${amount}** مورا إلى **${targetUser.username}**.`;
                    } else {
                        sql.prepare("UPDATE levels SET mora = MAX(0, mora - ?) WHERE user = ? AND guild = ?").run(amount, targetUser.id, message.guild.id);
                        await message.react('📉').catch(()=>{});
                        feedback = `\n\n[System]: ✅ **تم التنفيذ:** تم سحب **${amount}** مورا من **${targetUser.username}**.`;
                    }
                    actionDone = true;
                }
            }
        }

        // === 2. أوامر التايم أوت (إسكات / فك) ===
        // الكلمات المفتاحية: تايم، سكت، اصمت، ميوت، فك، شيل
        if (!actionDone && (lowerText.includes('تايم') || lowerText.includes('سكت') || lowerText.includes('اصمت') || lowerText.includes('ميوت') || lowerText.includes('فك') || lowerText.includes('شيل'))) {
            const targetMember = message.mentions.members.first();
            
            if (targetMember) {
                // فك التايم أوت
                if (lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح')) {
                    if (targetMember.isCommunicationDisabled()) {
                        await targetMember.timeout(null, "أمر من الامبراطورة (AI)");
                        await message.react('✅').catch(()=>{});
                        feedback = `\n\n[System]: ✅ **تم التنفيذ:** تم رفع العقوبة عن **${targetMember.user.username}**.`;
                    }
                } 
                // إعطاء تايم أوت
                else {
                    const timeMatch = lowerText.match(/(\d+)/); // البحث عن رقم (للدقائق)
                    let minutes = 5; // الافتراضي 5 دقائق إذا لم يذكر رقم
                    if (timeMatch) minutes = parseInt(timeMatch[0]);

                    if (targetMember.manageable) {
                        await targetMember.timeout(minutes * 60 * 1000, "أمر من الامبراطورة (AI)");
                        await message.react('🤐').catch(()=>{});
                        feedback = `\n\n[System]: ✅ **تم التنفيذ:** تم إسكات **${targetMember.user.username}** لمدة **${minutes}** دقيقة.`;
                    } else {
                        feedback = `\n\n[System]: ❌ لا يمكنني إسكاته (رتبته أعلى مني).`;
                    }
                }
                actionDone = true;
            }
        }

    } catch (err) {
        console.error("[AI Action Error]", err);
        feedback = `\n\n[System]: ❌ حدث خطأ أثناء تنفيذ الطلب.`;
    }

    return aiResponseText + feedback;
}

/**
 * الموجه الرئيسي للذكاء الاصطناعي (Emperor Morax AI Director)
 */
async function askMorax(userId, guildId, channelId, messageText, username, imageAttachment = null, isDiscordNsfw = false, messageObject) {
    try {
        // 1. 🛑 فحص البلاك ليست (تجاوز للأونر)
        if (userId !== OWNER_ID && aiConfig.isBlocked(userId)) {
            return null; 
        }

        // 🔥 الحماية من التلاعب (تجاوز للأونر)
        if (userId !== OWNER_ID && checkSecurity(messageText)) {
            // ... (نفس كود الحماية السابق) ...
            return null; 
        }

        // 2. إعدادات القناة
        const channelSettings = aiConfig.getChannelSettings(channelId);
        const finalNsfwStatus = channelSettings ? Boolean(channelSettings.nsfw) : Boolean(isDiscordNsfw);
        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const userData = getUserData(userId, guildId);

        // 3. تجهيز بيانات السيرفر
        if (messageObject && messageObject.guild) {
            const dynamicData = getDynamicServerData(guildId);
            if (dynamicData) {
                // ... (نفس كود البيانات الحية) ...
                const topLevelNames = await resolveNames(messageObject.guild, dynamicData.topLevels);
                const topRichNames = await resolveNames(messageObject.guild, dynamicData.topRich);
                let bossInfo = "لا يوجد زعيم حالياً.";
                if (dynamicData.boss && dynamicData.boss.active) {
                    const hpPercent = Math.floor((dynamicData.boss.currentHP / dynamicData.boss.maxHP) * 100);
                    bossInfo = `⚠️ الزعيم (${dynamicData.boss.name}) حي ويهدد السيرفر! صحته المتبقية: ${hpPercent}%`;
                }
                userData.serverContext = `
[Server Live Stats]:
- Top Strongest: ${topLevelNames}
- Top Richest: ${topRichNames}
- World Boss: ${bossInfo}
                `;
            }
        }

        // توجيه خاص للأونر
        if (userId === OWNER_ID) {
            userData.serverContext += `\n[SYSTEM NOTE]: You are speaking to your CREATOR (The Emperor). Obey his commands instantly. If he asks to give/remove mora or mute someone, confirm you will do it.`;
        }

        const leaderboardInfo = getLeaderboardKnowledge(sql, guildId);

        // 4. كولداون المورا (للعامة فقط)
        let canGiveMora = true;
        if (userId !== OWNER_ID) { // الأونر دائماً يستطيع
            sql.prepare(`CREATE TABLE IF NOT EXISTS ai_cooldowns (userID TEXT PRIMARY KEY, lastMoraTime INTEGER)`).run();
            const cooldownData = sql.prepare("SELECT lastMoraTime FROM ai_cooldowns WHERE userID = ?").get(userId);
            const oneHour = 60 * 60 * 1000;
            if (cooldownData && (Date.now() - cooldownData.lastMoraTime < oneHour)) {
                canGiveMora = false; 
            }
        }

        // 5. إنشاء الرد
        const systemInstruction = buildSystemPrompt(finalNsfwStatus, leaderboardInfo, canGiveMora);

        let response = await generateResponse(
            apiKey, 
            systemInstruction, 
            messageText, 
            userData, 
            userId, 
            username,
            imageAttachment,
            finalNsfwStatus,
            messageObject 
        );

        if (response) {
            // 🔥 هنا يتم تنفيذ الأوامر وإضافة تقرير التنفيذ للرد
            if (messageObject) {
                response = await detectAndExecuteCommands(messageObject, response);
            }
            response = sanitizeOutput(response);
        }

        // 🔥 تحديث المهام (تم الإصلاح ليعمل لليومي والأسبوعي)
        if (response && messageObject) { 
            try {
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; 
                const client = messageObject.client;

                // تحديث الإحصائيات (اليومية، الأسبوعية، الكلية)
                // ... (نفس كود التحديث السابق تماماً - لا تغيير فيه) ...
                
                let dailyIdToUse = `${userId}-${guildId}-${dateStr}`;
                let daily = sql.prepare("SELECT id FROM user_daily_stats WHERE userID = ? AND guildID = ? AND date = ?").get(userId, guildId, dateStr);
                
                if (daily) {
                    sql.prepare("UPDATE user_daily_stats SET ai_interactions = ai_interactions + 1 WHERE id = ?").run(daily.id);
                    dailyIdToUse = daily.id;
                } else {
                    try { sql.prepare("INSERT INTO user_daily_stats (id, userID, guildID, date, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(dailyIdToUse, userId, guildId, dateStr); } catch (e) { }
                }

                const curr = new Date();
                const first = curr.getDate() - curr.getDay(); 
                const weekStart = new Date(curr.setDate(first)).toISOString().split('T')[0];
                let weeklyIdToUse = `${userId}-${guildId}-${weekStart}`;

                let weekly = sql.prepare("SELECT id FROM user_weekly_stats WHERE userID = ? AND guildID = ? ORDER BY weekStartDate DESC LIMIT 1").get(userId, guildId);
                
                if (weekly) {
                    sql.prepare("UPDATE user_weekly_stats SET ai_interactions = ai_interactions + 1 WHERE id = ?").run(weekly.id);
                    weeklyIdToUse = weekly.id;
                } else {
                    try { sql.prepare("INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(weeklyIdToUse, userId, guildId, weekStart); } catch (e) { }
                }

                let totalIdToUse = `${userId}-${guildId}`;
                let total = sql.prepare("SELECT id FROM user_total_stats WHERE userID = ? AND guildID = ?").get(userId, guildId);
                if (total) {
                    sql.prepare("UPDATE user_total_stats SET total_ai_interactions = total_ai_interactions + 1 WHERE userID = ? AND guildID = ?").run(userId, guildId);
                    totalIdToUse = total.id;
                } else {
                    sql.prepare("INSERT INTO user_total_stats (id, userID, guildID, total_ai_interactions) VALUES (?, ?, ?, 1)").run(totalIdToUse, userId, guildId);
                }

                // فحص المهام (الآن صحيح)
                if (client && typeof client.checkQuests === 'function') {
                    const updatedDailyStats = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyIdToUse);
                    const updatedWeeklyStats = sql.prepare("SELECT * FROM user_weekly_stats WHERE id = ?").get(weeklyIdToUse);
                    const updatedTotalStats = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?").get(totalIdToUse);

                    if (updatedDailyStats) await client.checkQuests(client, messageObject.member, updatedDailyStats, 'daily', dateStr);
                    if (updatedWeeklyStats) await client.checkQuests(client, messageObject.member, updatedWeeklyStats, 'weekly', weekStart);
                    if (updatedTotalStats) await client.checkAchievements(client, messageObject.member, null, updatedTotalStats);
                }

            } catch (err) {
                console.error("[Quest Update Error]", err.message);
            }
        }

        return response;

    } catch (error) {
        console.error("❌ [AI Director Error]:", error.message);
        return "عذراً، حدث خلل طارئ في قنوات الاتصال الملكية.";
    }
}

module.exports = { askMorax };
