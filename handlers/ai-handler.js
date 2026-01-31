// handlers/ai-handler.js

const config = require('../config.json');
// 👇 استدعاء دالة البيانات الحية (القديمة والجديدة)
const { getUserData, getDynamicServerData } = require('./ai/knowledge');
const { getLeaderboardKnowledge } = require('./ai/serverLore'); // دالة التوب الجديدة
const { buildSystemPrompt } = require('./ai/persona');
const { generateResponse } = require('./ai/engine');
const aiConfig = require('../utils/aiConfig'); 
require('dotenv').config();

// 👇 إعداد قاعدة البيانات لاستخدامها مع دالة التوب الجديدة
const SQLite = require("better-sqlite3");
const path = require('path');
const dbPath = path.join(__dirname, '..', 'mainDB.sqlite');
const sql = new SQLite(dbPath);

/**
 * 🛠️ دالة مساعدة لتحويل الآيديات إلى أسماء (للأعضاء المتصدرين - الكود القديم)
 */
async function resolveNames(guild, dataList) {
    if (!dataList || dataList.length === 0) return "لا يوجد بيانات";
    const names = [];
    for (const item of dataList) {
        try {
            // محاولة جلب العضو من الكاش أو الديسكورد
            const member = await guild.members.fetch(item.user).catch(() => null);
            const name = member ? member.displayName : "شبح مغادر";
            // القيمة إما ليفل أو مجموع الفلوس
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

        // 2. 🔞 تحديد وضع NSFW بدقة
        const channelSettings = aiConfig.getChannelSettings(channelId);
        const finalNsfwStatus = channelSettings ? Boolean(channelSettings.nsfw) : Boolean(isDiscordNsfw);

        // 3. 🔑 التجهيز
        const apiKey = process.env.GEMINI_API_KEY || config.geminiApiKey;
        const userData = getUserData(userId, guildId);

        // 🔥🔥 3.5 تجهيز معلومات السيرفر الحية (التوب والزعيم) 🔥🔥
        // نستخدم messageObject.guild للوصول لأسماء الأعضاء (النظام القديم للزعيم)
        if (messageObject && messageObject.guild) {
            const dynamicData = getDynamicServerData(guildId);
            
            if (dynamicData) {
                // تحويل الآيديات لأسماء
                const topLevelNames = await resolveNames(messageObject.guild, dynamicData.topLevels);
                const topRichNames = await resolveNames(messageObject.guild, dynamicData.topRich);
                
                // حالة الزعيم
                let bossInfo = "لا يوجد زعيم حالياً (ميت أو لم يظهر).";
                if (dynamicData.boss && dynamicData.boss.active) {
                    const hpPercent = Math.floor((dynamicData.boss.currentHP / dynamicData.boss.maxHP) * 100);
                    bossInfo = `⚠️ الزعيم (${dynamicData.boss.name}) حي ويهدد السيرفر! صحته المتبقية: ${hpPercent}%`;
                }

                // إضافة المعلومات لملف المستخدم ليرسل للمحرك
                userData.serverContext = `
[Server Live Stats - معلومات السيرفر الحالية]:
- Top Strongest (أقوى المستويات): ${topLevelNames}
- Top Richest (أغنى الهوامير): ${topRichNames}
- World Boss Status (حالة الزعيم): ${bossInfo}
                `;
            }
        }

        // 🔥🔥🔥 الجديد: جلب التوب كنص من الدالة الجديدة (لتمريره للسيستم برومبت) 🔥🔥🔥
        const leaderboardInfo = getLeaderboardKnowledge(sql);

        // 4. 🎭 بناء الشخصية (مع تمرير معلومات التوب الجديدة)
        const systemInstruction = buildSystemPrompt(finalNsfwStatus, leaderboardInfo);

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
            messageObject // 👈 تمرير كائن الرسالة للمحرك (ضروري للأكشنات والألوان)
        );

        return response;

    } catch (error) {
        console.error("❌ [AI Director Error]:", error.message);
        return "عذراً، حدث خلل طارئ في قنوات الاتصال الملكية.";
    }
}

module.exports = { askMorax };
