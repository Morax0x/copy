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

// 🔥 جلب الدالة من المكان الصحيح 🔥
let updateGuildStat;
try {
    ({ updateGuildStat } = require('./guild-board-handler.js'));
} catch (e) {
    console.log("⚠️ Could not load updateGuildStat for AI Tracker.");
}

// الآيدي الخاص بك (الإمبراطور) - لن تعمل الأوامر إلا لك
const OWNER_ID = "1145327691772481577"; 

function sanitizeOutput(text) {
    if (!text) return "";
    let cleanText = text.replace(/@(everyone|here)/gi, "");
    cleanText = cleanText.replace(/<@!?\d+>/g, "(مغامر)"); 
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

// 🔥 محرك الأوامر الملكية المطور 🔥
async function detectAndExecuteCommands(message, aiResponseText) {
    if (!message || message.author.id !== OWNER_ID) return aiResponseText;

    const lowerText = message.content.toLowerCase();
    let feedback = ""; 
    let actionDone = false;

    const mentions = message.mentions.users.filter(u => u.id !== message.client.user.id);
    const targetUser = mentions.first(); 

    try {
        if (targetUser) {
            if (targetUser.id === message.client.user.id || targetUser.id === OWNER_ID) return aiResponseText;

            // 🔢 استخراج الرقم من كلامك
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

            // 1️⃣ نظام الخيمة (الدانجون) - تم تصحيح الأعمدة هنا
            if (lowerText.includes('خيم') || lowerText.includes('طابق')) {
                if (amount > 0) {
                    const guildID = message.guild.id;
                    const userID = targetUser.id;
                    const existingSave = sql.prepare("SELECT * FROM dungeon_saves WHERE hostID = ? AND guildID = ?").get(userID, guildID);
                    
                    if (existingSave) {
                        sql.prepare("UPDATE dungeon_saves SET floor = ?, timestamp = ? WHERE hostID = ? AND guildID = ?").run(amount, Date.now(), userID, guildID);
                    } else {
                        sql.prepare("INSERT INTO dungeon_saves (hostID, guildID, floor, timestamp) VALUES (?, ?, ?, ?)").run(userID, guildID, amount, Date.now());
                    }
                    await message.react('⛺').catch(()=>{});
                    feedback = `\n\n⛺ **تم التنفيذ:** تم منح **${targetUser.username}** خيمة حفظ في الدانجون عند الطابق **${amount}**.`;
                    actionDone = true;
                }
            }
            
            // 2️⃣ نظام السمعة (التزكية)
            else if (!actionDone && (lowerText.includes('سمع') || lowerText.includes('تزكي') || lowerText.includes('نقاط'))) {
                if (amount > 0) {
                    const guildID = message.guild.id;
                    const userID = targetUser.id;
                    const isGive = !lowerText.includes('سحب') && !lowerText.includes('اسحب') && !lowerText.includes('خصم') && !lowerText.includes('نقص'); 
                    
                    let repData = sql.prepare("SELECT * FROM user_reputation WHERE userID = ? AND guildID = ?").get(userID, guildID);
                    if (!repData) {
                        sql.prepare("INSERT INTO user_reputation (userID, guildID) VALUES (?, ?)").run(userID, guildID);
                    }

                    if (isGive) {
                        sql.prepare("UPDATE user_reputation SET rep_points = rep_points + ? WHERE userID = ? AND guildID = ?").run(amount, userID, guildID);
                        await message.react('🌟').catch(()=>{});
                        feedback = `\n\n🌟 **تم التنفيذ:** تم إضافة **${amount}** نقطة سمعة إلى **${targetUser.username}**.`;
                    } else {
                        sql.prepare("UPDATE user_reputation SET rep_points = MAX(0, rep_points - ?) WHERE userID = ? AND guildID = ?").run(amount, userID, guildID);
                        await message.react('💔').catch(()=>{});
                        feedback = `\n\n💔 **تم التنفيذ:** تم خصم **${amount}** نقطة سمعة من **${targetUser.username}**.`;
                    }
                    actionDone = true;
                }
            }

            // 3️⃣ نظام المورا
            else if (!actionDone && (lowerText.includes('اعط') || lowerText.includes('حول') || lowerText.includes('هاتي') || lowerText.includes('سحب') || lowerText.includes('اسحب'))) {
                if (amount > 0) {
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

            // 4️⃣ نظام العقوبات (الميوت/التايم اوت)
            if (!actionDone && (lowerText.includes('تايم') || lowerText.includes('سكت') || lowerText.includes('اصمت') || lowerText.includes('ميوت') || lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح'))) {
                const targetMember = await message.guild.members.fetch(targetUser.id).catch(()=>null);
                if (targetMember) {
                    if (lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح')) {
                        if (targetMember.isCommunicationDisabled()) {
                            await targetMember.timeout(null, "أمر من الامبراطورة (AI)");
                            await message.react('✅').catch(()=>{});
                            feedback = `\n\n✅ **تم التنفيذ:** تم رفع العقوبة عن **${targetMember.user.username}**.`;
                        }
                    } 
                    else {
                        let minutes = 5; 
                        if (amount > 0) minutes = amount; // إذا حطيت رقم بياخذه كدقائق

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
            let dynamicContext = "";
            const dynamicData = getDynamicServerData(guildId);
            
            if (dynamicData) {
                const topLevelNames = await resolveNames(messageObject.guild, dynamicData.topLevels);
                const topRichNames = await resolveNames(messageObject.guild, dynamicData.topRich);
                let bossInfo = "لا يوجد زعيم حالياً.";
                if (dynamicData.boss && dynamicData.boss.active) {
                    const hpPercent = Math.floor((dynamicData.boss.currentHP / dynamicData.boss.maxHP) * 100);
                    bossInfo = `⚠️ الزعيم (${dynamicData.boss.name}) حي ويهدد السيرفر! صحته المتبقية: ${hpPercent}%`;
                }
                dynamicContext = `\n[Server Live Stats]:\n- Top Strongest: ${topLevelNames}\n- Top Richest: ${topRichNames}\n- World Boss: ${bossInfo}\n`;
            }

            // 💡 استخراج أسماء الأشخاص المذكورين
            let mentionedNames = [];
            messageObject.mentions.users.forEach(u => {
                if (u.id !== messageObject.client.user.id) {
                    const mem = messageObject.guild.members.cache.get(u.id);
                    mentionedNames.push(mem ? mem.displayName : u.username);
                }
            });
            const mentionedContext = mentionedNames.length > 0 ? `\n- الأسماء المذكورة في رسالة اللاعب: ${mentionedNames.join(' و ')}. استخدم هذه الأسماء للرد عليه.` : "";

            const totalWealth = userData.total_wealth || ((userData.mora || 0) + (userData.bank || 0)) || ((userData.wallet_cash || 0) + (userData.bank_balance || 0));

            userData.serverContext = dynamicContext + `
[CRITICAL AI INSTRUCTIONS]:
1. ثروة اللاعب الذي يحادثك هي بالضبط: ${totalWealth} مورا (هذا مجموع ماله الكلي). عامله على أساس هذا الرقم، ولا تقل أبداً أنه مفلس إذا كان يمتلك مورا.
2. يُمنع منعاً باتاً استخدام المنشن في ردودك (مثل <@123456>). اكتب أسماء الأعضاء كنص عادي فقط.${mentionedContext}
            `;
        }

        // 🔥 إخبار الإمبراطورة بقدراتها الجديدة
        if (userId === OWNER_ID) {
            userData.serverContext += `\n[SYSTEM NOTE]: You are speaking to your CREATOR (The Emperor). Obey his commands instantly. If he asks to give/remove mora, add/remove reputation (سمعة/تزكية), set a dungeon tent (خيمة/طابق), or mute someone, confirm you will do it enthusiastically.`;
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
                
                const nowKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
                const dateStr = nowKSA.toLocaleDateString('en-CA'); 
                
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
                    await updateGuildStat(client, guildId, userId, 'ai_interactions', 1);
                }

                // 2. تحديث الأسبوعي
                const dayOfWeek = nowKSA.getDay(); 
                const diff = nowKSA.getDate() - dayOfWeek;
                const weekStartKSA = new Date(nowKSA);
                weekStartKSA.setDate(diff);
                const weekStart = weekStartKSA.toLocaleDateString('en-CA'); 
                
                let weeklyIdToUse = `${userId}-${guildId}-${weekStart}`;

                let weekly = sql.prepare("SELECT id FROM user_weekly_stats WHERE userID = ? AND guildID = ? AND weekStartDate = ?").get(userId, guildId, weekStart);
                
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
