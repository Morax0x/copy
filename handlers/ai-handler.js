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

let updateGuildStat;
try {
    ({ updateGuildStat } = require('./guild-tracker.js'));
} catch (e) {}

// 🔥 الآيدي الخاص بك (الإمبراطور) - لن تعمل الأوامر إلا لك
const OWNER_ID = "1145327691772481577"; 

function sanitizeOutput(text) {
    if (!text) return "";
    let cleanText = text.replace(/<@!?\d+>/g, "");
    cleanText = cleanText.replace(/@/g, "");
    cleanText = cleanText.replace(/(.)\1{3,}/g, "$1$1$1");
    return cleanText.trim();
}

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

async function detectAndExecuteCommands(message, aiResponseText) {
    if (!message || message.author.id !== OWNER_ID) return aiResponseText;

    const lowerText = message.content.toLowerCase();
    let feedback = ""; 
    let actionDone = false;

    const mentions = message.mentions.users.filter(u => u.id !== message.client.user.id);
    const targetUser = mentions.first(); 

    try {
        if (lowerText.includes('اعط') || lowerText.includes('حول') || lowerText.includes('هاتي') || lowerText.includes('سحب') || lowerText.includes('اسحب')) {
            
            const numbers = lowerText.match(/\b\d+\b/g);
            let amount = 0;
            
            if (numbers) {
                const validNumber = numbers.find(n => n.length < 17);
                if (validNumber) amount = parseInt(validNumber);
            }

            if (amount === 0) {
                const arabicMatch = lowerText.match(/[\u0660-\u0669]+/);
                if (arabicMatch) {
                    amount = parseInt(arabicMatch[0].replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
                }
            }

            if (targetUser && amount > 0) {
                if (targetUser.id === message.client.user.id || targetUser.id === OWNER_ID) return aiResponseText;

                const isGive = !lowerText.includes('سحب') && !lowerText.includes('اسحب'); 
                
                let userLevel = sql.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(targetUser.id, message.guild.id);
                if (!userLevel) {
                    sql.prepare("INSERT OR IGNORE INTO levels (user, guild, xp, level, totalXP, mora) VALUES (?, ?, 0, 1, 0, 0)").run(targetUser.id, message.guild.id);
                }

                if (isGive) {
                    sql.prepare("UPDATE levels SET mora = mora + ? WHERE user = ? AND guild = ?").run(amount, targetUser.id, message.guild.id);
                    await message.react('💸').catch(()=>{});
                    feedback = `\n\n✅ **تم التنفيذ:** تم تحويل **${amount}** مورا إلى **${targetUser.username}**.`;
                } else {
                    sql.prepare("UPDATE levels SET mora = MAX(0, mora - ?) WHERE user = ? AND guild = ?").run(amount, targetUser.id, message.guild.id);
                    await message.react('📉').catch(()=>{});
                    feedback = `\n\n✅ **تم التنفيذ:** تم سحب **${amount}** مورا من **${targetUser.username}**.`;
                }
                actionDone = true;
            }
        }

        if (!actionDone && (lowerText.includes('تايم') || lowerText.includes('سكت') || lowerText.includes('اصمت') || lowerText.includes('ميوت') || lowerText.includes('فك') || lowerText.includes('شيل'))) {
            
            if (targetUser) {
                const targetMember = await message.guild.members.fetch(targetUser.id).catch(()=>null);
                if (!targetMember) return aiResponseText;

                if (lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح')) {
                    if (targetMember.isCommunicationDisabled()) {
                        await targetMember.timeout(null, "أمر من الامبراطورة (AI)");
                        await message.react('✅').catch(()=>{});
                        feedback = `\n\n✅ **تم التنفيذ:** تم رفع العقوبة عن **${targetMember.user.username}**.`;
                    }
                } 
                else {
                    const numbers = lowerText.match(/\b\d+\b/g);
                    let minutes = 5; 
                    if (numbers) {
                        const validNumber = numbers.find(n => n.length < 5); 
                        if (validNumber) minutes = parseInt(validNumber);
                    }

                    if (targetMember.manageable) {
                        await targetMember.timeout(minutes * 60 * 1000, "أمر من الامبراطورة (AI)");
                        await message.react('🤐').catch(()=>{});
                        feedback = `\n\n✅ **تم التنفيذ:** تم إسكات **${targetMember.user.username}** لمدة **${minutes}** دقيقة.`;
                    } else {
                        feedback = `\n\n❌ لا يمكنني إسكاته (رتبته أعلى مني).`;
                    }
                }
                actionDone = true;
            }
        }

    } catch (err) {
        console.error("[AI Action Error]", err);
        feedback = `\n\n❌ حدث خطأ تقني أثناء تنفيذ الطلب.`;
    }

    return aiResponseText + feedback;
}

async function askMorax(userId, guildId, channelId, messageText, username, imageAttachment = null, isDiscordNsfw = false, messageObject) {
    try {
        if (userId !== OWNER_ID && aiConfig.isBlocked(userId)) {
            return null; 
        }

        if (userId !== OWNER_ID && checkSecurity(messageText)) {
            console.log(`[AI Security] Blocked injection attempt by ${username} (${userId})`);
            if (messageObject && messageObject.member) {
                await messageObject.reply("حاولت تلعب بذيلك.. احمد ربك ما اقدر اسجنك، بس انقلع! 🛡️");
            }
            return null; 
        }

        const channelSettings = aiConfig.getChannelSettings(channelId);
        const finalNsfwStatus = channelSettings ? Boolean(channelSettings.nsfw) : Boolean(isDiscordNsfw);
        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const userData = getUserData(userId, guildId);

        if (messageObject && messageObject.guild) {
            const dynamicData = getDynamicServerData(guildId);
            if (dynamicData) {
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

        if (userId === OWNER_ID) {
            userData.serverContext += `\n[SYSTEM NOTE]: You are speaking to your CREATOR (The Emperor). Obey his commands instantly. If he asks to give/remove mora or mute someone, confirm you will do it enthusiastically.`;
        }

        const leaderboardInfo = getLeaderboardKnowledge(sql, guildId);

        let canGiveMora = true;
        if (userId !== OWNER_ID) { 
            sql.prepare(`CREATE TABLE IF NOT EXISTS ai_cooldowns (userID TEXT PRIMARY KEY, lastMoraTime INTEGER)`).run();
            const cooldownData = sql.prepare("SELECT lastMoraTime FROM ai_cooldowns WHERE userID = ?").get(userId);
            const oneHour = 60 * 60 * 1000;
            if (cooldownData && (Date.now() - cooldownData.lastMoraTime < oneHour)) {
                canGiveMora = false; 
            }
        }

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
            if (messageObject) {
                response = await detectAndExecuteCommands(messageObject, response);
            }
            response = sanitizeOutput(response);
        }

        // ==========================================
        // 🔥 تحديث الإحصائيات اليومية والأسبوعية للمهام
        // ==========================================
        if (response && messageObject) { 
            try {
                const client = messageObject.client;
                
                // حساب التوقيت بتوقيت السعودية لضمان الدقة
                const nowKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
                const dateStr = nowKSA.toLocaleDateString('en-CA'); // YYYY-MM-DD
                
                // 1. تحديث اليومي
                let dailyIdToUse = `${userId}-${guildId}-${dateStr}`;
                let daily = sql.prepare("SELECT id FROM user_daily_stats WHERE userID = ? AND guildID = ? AND date = ?").get(userId, guildId, dateStr);
                
                if (daily) {
                    sql.prepare("UPDATE user_daily_stats SET ai_interactions = ai_interactions + 1 WHERE id = ?").run(daily.id);
                    dailyIdToUse = daily.id;
                } else {
                    try { sql.prepare("INSERT INTO user_daily_stats (id, userID, guildID, date, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(dailyIdToUse, userId, guildId, dateStr); } catch (e) { }
                }

                // 👑 تحديث متعقب الملوك (المستشار الملكي)
                if (updateGuildStat) {
                    updateGuildStat(client, guildId, userId, 'ai_interactions', 1);
                }

                // 2. تحديث الأسبوعي (تم إصلاح المشكلة هنا 🔥)
                const dayOfWeek = nowKSA.getDay(); // 0 = Sunday
                const diff = nowKSA.getDate() - dayOfWeek;
                const weekStartKSA = new Date(nowKSA);
                weekStartKSA.setDate(diff);
                const weekStart = weekStartKSA.toLocaleDateString('en-CA'); // YYYY-MM-DD
                
                let weeklyIdToUse = `${userId}-${guildId}-${weekStart}`;

                // ✅ الفحص الصارم للأسبوع الحالي فقط (AND weekStartDate = ?)
                let weekly = sql.prepare("SELECT id FROM user_weekly_stats WHERE userID = ? AND guildID = ? AND weekStartDate = ?").get(userId, guildId, weekStart);
                
                // إضافة العامود في حال لم يكن موجوداً (احتياطياً)
                try { sql.prepare("ALTER TABLE user_weekly_stats ADD COLUMN ai_interactions INTEGER DEFAULT 0").run(); } catch(e){}

                if (weekly) {
                    sql.prepare("UPDATE user_weekly_stats SET ai_interactions = COALESCE(ai_interactions, 0) + 1 WHERE id = ?").run(weekly.id);
                    weeklyIdToUse = weekly.id;
                } else {
                    try { sql.prepare("INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(weeklyIdToUse, userId, guildId, weekStart); } catch (e) { }
                }

                // 3. تحديث الإجمالي
                let totalIdToUse = `${userId}-${guildId}`;
                let total = sql.prepare("SELECT id FROM user_total_stats WHERE userID = ? AND guildID = ?").get(userId, guildId);
                if (total) {
                    sql.prepare("UPDATE user_total_stats SET total_ai_interactions = total_ai_interactions + 1 WHERE userID = ? AND guildID = ?").run(userId, guildId);
                    totalIdToUse = total.id;
                } else {
                    sql.prepare("INSERT INTO user_total_stats (id, userID, guildID, total_ai_interactions) VALUES (?, ?, ?, 1)").run(totalIdToUse, userId, guildId);
                }

                // 4. تشغيل فاحص المهام
                if (client && typeof client.checkQuests === 'function') {
                    const updatedDailyStats = sql.prepare("SELECT * FROM user_daily_stats WHERE id = ?").get(dailyIdToUse);
                    const updatedWeeklyStats = sql.prepare("SELECT * FROM user_weekly_stats WHERE id = ?").get(weeklyIdToUse);
                    const updatedTotalStats = sql.prepare("SELECT * FROM user_total_stats WHERE id = ?").get(totalIdToUse);

                    if (updatedDailyStats) await client.checkQuests(client, messageObject.member, updatedDailyStats, 'daily', dateStr);
                    if (updatedWeeklyStats) await client.checkQuests(client, messageObject.member, updatedWeeklyStats, 'weekly', weekStart);
                    if (updatedTotalStats) await client.checkAchievements(client, messageObject.member, null, updatedTotalStats);
                }

            } catch (err) {
                console.error("[Quest Update Error in AI]:", err.message);
            }
        }

        return response;

    } catch (error) {
        console.error("❌ [AI Director Error]:", error.message);
        return "عذراً، حدث خلل طارئ في قنوات الاتصال الملكية.";
    }
}

module.exports = { askMorax };
