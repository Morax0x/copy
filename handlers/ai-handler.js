// handlers/ai-handler.js

const config = require('../config.json');
const { getUserData, getDynamicServerData } = require('./ai/knowledge');
const { getLeaderboardKnowledge } = require('./ai/serverLore'); 
const { buildSystemPrompt } = require('./ai/persona');
const { generateResponse } = require('./ai/engine');
const aiConfig = require('../utils/aiConfig'); 
// 👇 إضافة ملف الحماية الجديد
const { checkSecurity } = require('./ai/security'); 
require('dotenv').config();

const SQLite = require("better-sqlite3");
const path = require('path');
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

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

        // 🔥🔥🔥 1.5 فحص الحماية (Anti-Prompt Injection) 🔥🔥🔥
        // هذا الكود يفحص الرسالة قبل إرسالها لـ Gemini
        if (checkSecurity(messageText)) {
            console.log(`[AI Security] Blocked injection attempt by ${username} (${userId})`);
            
            // العقاب: تايم أوت 5 دقائق
            if (messageObject && messageObject.member) {
                if (messageObject.member.moderatable) {
                    try {
                        await messageObject.member.timeout(5 * 60 * 1000, "محاولة التلاعب بالذكاء الاصطناعي (Prompt Injection)");
                        await messageObject.react('🚫');
                        await messageObject.reply("🛑 **تم كشف محاولة تلاعب!**\nتحسبني غبية؟.. خيس بالسجن 5 دقايق عشان تتأدب! 🛡️");
                    } catch (e) {
                        console.error("[AI Security] Failed to timeout:", e.message);
                        await messageObject.reply("حاولت تلعب بذيلك.. احمد ربك ما اقدر اسجنك، بس انقلع! 🛡️");
                    }
                } else {
                    await messageObject.reply("حاولت تلعب بذيلك.. احمد ربك ما اقدر اسجنك، بس انقلع! 🛡️");
                }
            }
            return null; // ⛔ وقف التنفيذ فوراً
        }

        // 2. 🔞 تحديد وضع NSFW بدقة
        const channelSettings = aiConfig.getChannelSettings(channelId);
        const finalNsfwStatus = channelSettings ? Boolean(channelSettings.nsfw) : Boolean(isDiscordNsfw);

        // 3. 🔑 التجهيز
        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const userData = getUserData(userId, guildId);

        // 🔥🔥 3.5 تجهيز معلومات السيرفر الحية (التوب والزعيم) 🔥🔥
        if (messageObject && messageObject.guild) {
            const dynamicData = getDynamicServerData(guildId);
            
            if (dynamicData) {
                const topLevelNames = await resolveNames(messageObject.guild, dynamicData.topLevels);
                const topRichNames = await resolveNames(messageObject.guild, dynamicData.topRich);
                
                let bossInfo = "لا يوجد زعيم حالياً (ميت أو لم يظهر).";
                if (dynamicData.boss && dynamicData.boss.active) {
                    const hpPercent = Math.floor((dynamicData.boss.currentHP / dynamicData.boss.maxHP) * 100);
                    bossInfo = `⚠️ الزعيم (${dynamicData.boss.name}) حي ويهدد السيرفر! صحته المتبقية: ${hpPercent}%`;
                }

                userData.serverContext = `
[Server Live Stats - معلومات السيرفر الحالية]:
- Top Strongest (أقوى المستويات): ${topLevelNames}
- Top Richest (أغنى الهوامير): ${topRichNames}
- World Boss Status (حالة الزعيم): ${bossInfo}
                `;
            }
        }

        // 🔥🔥🔥 جلب التوب كنص من الدالة الجديدة (مع تمرير guildId) 🔥🔥🔥
        const leaderboardInfo = getLeaderboardKnowledge(sql, guildId);

        // ============================================================
        // 🕒 فحص كولداون المورا (Mora Cooldown Check)
        // ============================================================
        sql.prepare(`CREATE TABLE IF NOT EXISTS ai_cooldowns (userID TEXT PRIMARY KEY, lastMoraTime INTEGER)`).run();
        
        const cooldownData = sql.prepare("SELECT lastMoraTime FROM ai_cooldowns WHERE userID = ?").get(userId);
        const oneHour = 60 * 60 * 1000;
        const now = Date.now();
        let canGiveMora = true;

        if (cooldownData && (now - cooldownData.lastMoraTime < oneHour)) {
            canGiveMora = false; 
        }

        // 4. 🎭 بناء الشخصية
        const systemInstruction = buildSystemPrompt(finalNsfwStatus, leaderboardInfo, canGiveMora);

        // 5. 🧠 إرسال الطلب للمحرك
        const response = await generateResponse(
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

        return response;

    } catch (error) {
        console.error("❌ [AI Director Error]:", error.message);
        return "عذراً، حدث خلل طارئ في قنوات الاتصال الملكية.";
    }
}

module.exports = { askMorax };
