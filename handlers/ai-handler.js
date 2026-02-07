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

/**
 * 🧹 دالة تنظيف النص من المنشن المزعج والتكرار (السبام)
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
 * الموجه الرئيسي للذكاء الاصطناعي (Emperor Morax AI Director)
 */
async function askMorax(userId, guildId, channelId, messageText, username, imageAttachment = null, isDiscordNsfw = false, messageObject) {
    try {
        // 1. 🛑 فحص البلاك ليست
        if (aiConfig.isBlocked(userId)) {
            return null; 
        }

        // 🔥 الحماية من التلاعب
        if (checkSecurity(messageText)) {
            console.log(`[AI Security] Blocked injection attempt by ${username} (${userId})`);
            if (messageObject && messageObject.member) {
                if (messageObject.member.moderatable) {
                    try {
                        await messageObject.member.timeout(5 * 60 * 1000, "محاولة التلاعب بالذكاء الاصطناعي");
                        await messageObject.react('🚫');
                        await messageObject.reply("🛑 **تم كشف محاولة تلاعب!**\nتحسبني غبية؟.. خيس بالسجن 5 دقايق عشان تتأدب! 🛡️");
                    } catch (e) {
                        await messageObject.reply("حاولت تلعب بذيلك.. احمد ربك ما اقدر اسجنك، بس انقلع! 🛡️");
                    }
                } else {
                    await messageObject.reply("حاولت تلعب بذيلك.. احمد ربك ما اقدر اسجنك، بس انقلع! 🛡️");
                }
            }
            return null; 
        }

        // 2. إعدادات القناة والمحتوى
        const channelSettings = aiConfig.getChannelSettings(channelId);
        const finalNsfwStatus = channelSettings ? Boolean(channelSettings.nsfw) : Boolean(isDiscordNsfw);
        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const userData = getUserData(userId, guildId);

        // 3. تجهيز بيانات السيرفر الحية
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

        const leaderboardInfo = getLeaderboardKnowledge(sql, guildId);

        // 4. فحص كولداون المورا
        sql.prepare(`CREATE TABLE IF NOT EXISTS ai_cooldowns (userID TEXT PRIMARY KEY, lastMoraTime INTEGER)`).run();
        const cooldownData = sql.prepare("SELECT lastMoraTime FROM ai_cooldowns WHERE userID = ?").get(userId);
        const oneHour = 60 * 60 * 1000;
        let canGiveMora = true;
        if (cooldownData && (Date.now() - cooldownData.lastMoraTime < oneHour)) {
            canGiveMora = false; 
        }

        // 5. بناء البرومبت وإرسال الطلب
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

        // 🔥🔥🔥 تطبيق الفلتر القوي (Sanitizer) قبل الرد 🔥🔥🔥
        if (response) {
            response = sanitizeOutput(response);
        }

        // 🔥🔥🔥 [مهم] تحديث المهام يدوياً لضمان العمل 100% 🔥🔥🔥
        if (response && messageObject) { 
            try {
                const now = new Date();
                const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

                // 1️⃣ تحديث الإحصائيات اليومية
                let daily = sql.prepare("SELECT id FROM user_daily_stats WHERE userID = ? AND guildID = ? AND date = ?").get(userId, guildId, dateStr);
                if (daily) {
                    sql.prepare("UPDATE user_daily_stats SET ai_interactions = ai_interactions + 1 WHERE id = ?").run(daily.id);
                } else {
                    const uniqueId = `${userId}-${guildId}-${dateStr}`;
                    try {
                        sql.prepare("INSERT INTO user_daily_stats (id, userID, guildID, date, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(uniqueId, userId, guildId, dateStr);
                    } catch (e) { }
                }

                // 2️⃣ تحديث الإحصائيات الأسبوعية
                let weekly = sql.prepare("SELECT id FROM user_weekly_stats WHERE userID = ? AND guildID = ? ORDER BY weekStartDate DESC LIMIT 1").get(userId, guildId);
                
                if (weekly) {
                    // إذا وجد سجل للأسبوع الحالي، حدثه
                    sql.prepare("UPDATE user_weekly_stats SET ai_interactions = ai_interactions + 1 WHERE id = ?").run(weekly.id);
                } else {
                    // 🔥🔥🔥 هذا هو الإصلاح: إذا لم يوجد سجل، قم بإنشائه فوراً 🔥🔥🔥
                    // حساب بداية الأسبوع (يوم الأحد عادة)
                    const curr = new Date();
                    const first = curr.getDate() - curr.getDay(); // يوم الأحد
                    const weekStart = new Date(curr.setDate(first)).toISOString().split('T')[0];
                    const uniqueWeeklyId = `${userId}-${guildId}-${weekStart}`;

                    try {
                        sql.prepare("INSERT INTO user_weekly_stats (id, userID, guildID, weekStartDate, ai_interactions) VALUES (?, ?, ?, ?, 1)").run(uniqueWeeklyId, userId, guildId, weekStart);
                    } catch (e) {
                        // في حال فشل الإنشاء (نادر جداً)، نحاول التحديث مرة أخيرة
                        console.error("[Weekly Stats Insert Error]", e.message);
                    }
                }

                // 3️⃣ تحديث الإحصائيات الكلية
                let total = sql.prepare("SELECT id FROM user_total_stats WHERE userID = ? AND guildID = ?").get(userId, guildId);
                if (total) {
                    sql.prepare("UPDATE user_total_stats SET total_ai_interactions = total_ai_interactions + 1 WHERE userID = ? AND guildID = ?").run(userId, guildId);
                } else {
                    sql.prepare("INSERT INTO user_total_stats (id, userID, guildID, total_ai_interactions) VALUES (?, ?, ?, 1)").run(`${userId}-${guildId}`, userId, guildId);
                }

                // 4️⃣ تشغيل فاحص المهام
                if (messageObject.client && typeof messageObject.client.checkQuests === 'function') {
                    messageObject.client.checkQuests(messageObject, 'ai_interactions');
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
