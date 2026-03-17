const config = require('../config.json');
const { getUserData, getDynamicServerData } = require('./ai/knowledge');
const { getLeaderboardKnowledge } = require('./ai/serverLore'); 
const { buildSystemPrompt } = require('./ai/persona');
const { generateResponse } = require('./ai/engine');
const aiConfig = require('../utils/aiConfig'); 
const { checkSecurity } = require('./ai/security'); 
require('dotenv').config();

const OWNER_ID = "1145327691772481577"; 

function sanitizeOutput(text) {
    if (!text) return "";
    let cleanText = text.replace(/@(everyone|here)/gi, "");
    cleanText = cleanText.replace(/<@!?\d+>/g, ""); 
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

async function detectAndExecuteCommands(message, aiResponseText, db) {
    if (!message || message.author.id !== OWNER_ID || !db) return aiResponseText;

    const lowerText = message.content.toLowerCase();
    let feedback = ""; 
    let actionDone = false;

    const mentions = message.mentions.users.filter(u => u.id !== message.client.user.id);
    const targetUser = mentions.first(); 

    try {
        if (targetUser) {
            if (targetUser.id === message.client.user.id || targetUser.id === OWNER_ID) return aiResponseText;

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

            // 1. خيمة الدانجون
            if (lowerText.includes('خيم') || lowerText.includes('طابق')) {
                if (amount > 0) {
                    const guildID = message.guild.id;
                    const userID = targetUser.id;
                    const saveRes = await db.query('SELECT * FROM dungeon_saves WHERE "hostID" = $1 AND "guildID" = $2', [userID, guildID]);
                    const existingSave = saveRes.rows[0];
                    
                    if (existingSave) {
                        await db.query('UPDATE dungeon_saves SET "floor" = $1, "timestamp" = $2 WHERE "hostID" = $3 AND "guildID" = $4', [amount, Date.now(), userID, guildID]);
                    } else {
                        await db.query('INSERT INTO dungeon_saves ("hostID", "guildID", "floor", "timestamp") VALUES ($1, $2, $3, $4)', [userID, guildID, amount, Date.now()]);
                    }
                    await message.react('⛺').catch(()=>{});
                    feedback = `\n\n⛺ **تم التنفيذ:** تم منح **${targetUser.username}** خيمة حفظ في الدانجون عند الطابق **${amount}**.`;
                    actionDone = true;
                }
            }
            
            // 2. السمعة / التزكية
            else if (!actionDone && (lowerText.includes('سمع') || lowerText.includes('تزكي') || lowerText.includes('نقاط'))) {
                if (amount > 0) {
                    const guildID = message.guild.id;
                    const userID = targetUser.id;
                    const isGive = !lowerText.includes('سحب') && !lowerText.includes('اسحب') && !lowerText.includes('خصم') && !lowerText.includes('نقص'); 
                    
                    const repRes = await db.query('SELECT * FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2', [userID, guildID]);
                    if (repRes.rows.length === 0) {
                        await db.query('INSERT INTO user_reputation ("userID", "guildID", "rep_points") VALUES ($1, $2, 0)', [userID, guildID]);
                    }

                    if (isGive) {
                        await db.query('UPDATE user_reputation SET "rep_points" = COALESCE("rep_points", 0) + $1 WHERE "userID" = $2 AND "guildID" = $3', [amount, userID, guildID]);
                        await message.react('🌟').catch(()=>{});
                        feedback = `\n\n🌟 **تم التنفيذ:** تم إضافة **${amount}** نقطة سمعة إلى **${targetUser.username}**.`;
                    } else {
                        await db.query('UPDATE user_reputation SET "rep_points" = GREATEST(0, COALESCE("rep_points", 0) - $1) WHERE "userID" = $2 AND "guildID" = $3', [amount, userID, guildID]);
                        await message.react('💔').catch(()=>{});
                        feedback = `\n\n💔 **تم التنفيذ:** تم خصم **${amount}** نقطة سمعة من **${targetUser.username}**.`;
                    }
                    actionDone = true;
                }
            }

            // 3. المورا
            else if (!actionDone && (lowerText.includes('اعط') || lowerText.includes('حول') || lowerText.includes('هاتي') || lowerText.includes('سحب') || lowerText.includes('اسحب'))) {
                if (amount > 0) {
                    const isGive = !lowerText.includes('سحب') && !lowerText.includes('اسحب'); 
                    
                    const lvlRes = await db.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [targetUser.id, message.guild.id]);
                    if (lvlRes.rows.length === 0) {
                        await db.query('INSERT INTO levels ("user", "guild", "xp", "level", "totalXP", "mora") VALUES ($1, $2, 0, 1, 0, 0) ON CONFLICT ("user", "guild") DO NOTHING', [targetUser.id, message.guild.id]);
                    }

                    if (isGive) {
                        await db.query('UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3', [String(amount), targetUser.id, message.guild.id]);
                        await message.react('💸').catch(()=>{});
                        feedback = `\n\n✅ **تم التنفيذ:** تم تحويل **${amount}** مورا إلى **${targetUser.username}**.`;
                    } else {
                        await db.query('UPDATE levels SET "mora" = GREATEST(0, CAST("mora" AS BIGINT) - CAST($1 AS BIGINT)) WHERE "user" = $2 AND "guild" = $3', [String(amount), targetUser.id, message.guild.id]);
                        await message.react('📉').catch(()=>{});
                        feedback = `\n\n✅ **تم التنفيذ:** تم سحب **${amount}** مورا من **${targetUser.username}**.`;
                    }
                    
                    if (message.client.getLevel) {
                        let cache = await message.client.getLevel(targetUser.id, message.guild.id);
                        if (cache) {
                            if (isGive) cache.mora = String(BigInt(cache.mora || 0) + BigInt(amount));
                            else {
                                let newMora = BigInt(cache.mora || 0) - BigInt(amount);
                                cache.mora = newMora > 0n ? String(newMora) : "0";
                            }
                            await message.client.setLevel(cache);
                        }
                    }

                    actionDone = true;
                }
            }

            // 4. الميوت
            if (!actionDone && (lowerText.includes('تايم') || lowerText.includes('سكت') || lowerText.includes('اصمت') || lowerText.includes('ميوت') || lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح'))) {
                const targetMemberObj = await message.guild.members.fetch(targetUser.id).catch(()=>null);
                if (targetMemberObj) {
                    if (lowerText.includes('فك') || lowerText.includes('شيل') || lowerText.includes('سامح')) {
                        if (targetMemberObj.isCommunicationDisabled()) {
                            await targetMemberObj.timeout(null, "أمر من الامبراطورة (AI)");
                            await message.react('✅').catch(()=>{});
                            feedback = `\n\n✅ **تم التنفيذ:** تم رفع العقوبة عن **${targetMemberObj.user.username}**.`;
                        }
                    } 
                    else {
                        let minutes = 5; 
                        if (amount > 0) minutes = amount; 

                        if (targetMemberObj.manageable) {
                            await targetMemberObj.timeout(minutes * 60 * 1000, "أمر من الامبراطورة (AI)");
                            await message.react('🤐').catch(()=>{});
                            feedback = `\n\n✅ **تم التنفيذ:** تم إسكات **${targetMemberObj.user.username}** لمدة **${minutes}** دقيقة.`;
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
        
        const db = messageObject ? messageObject.client.sql : null; 
        
        const userData = await getUserData(userId, guildId, db);

        if (messageObject && messageObject.guild) {
            let dynamicContext = "";
            const dynamicData = await getDynamicServerData(guildId, db);
            
            if (dynamicData) {
                const topLevelNames = await resolveNames(messageObject.guild, dynamicData.topLevels);
                const topRichNames = await resolveNames(messageObject.guild, dynamicData.topRich);
                let bossInfo = "لا يوجد زعيم حالياً.";
                if (dynamicData.boss && (dynamicData.boss.active || dynamicData.boss.active === 1)) {
                    const hpPercent = Math.floor((dynamicData.boss.currentHP / dynamicData.boss.maxHP) * 100);
                    bossInfo = `⚠️ الزعيم (${dynamicData.boss.name}) حي ويهدد السيرفر! صحته المتبقية: ${hpPercent}%`;
                }
                dynamicContext = `\n[Server Live Stats]:\n- Top Strongest: ${topLevelNames}\n- Top Richest: ${topRichNames}\n- World Boss: ${bossInfo}\n`;
            }

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

        if (userId === OWNER_ID) {
            userData.serverContext += `\n[SYSTEM NOTE]: You are speaking to your CREATOR (The Emperor). Obey his commands instantly. If he asks to give/remove mora, add/remove reputation (سمعة/تزكية), set a dungeon tent (خيمة/طابق), or mute someone, confirm you will do it enthusiastically.`;
        }

        const leaderboardInfo = await getLeaderboardKnowledge(db, guildId);

        let canGiveMora = true;
        if (userId !== OWNER_ID && db) { 
            await db.query(`CREATE TABLE IF NOT EXISTS ai_cooldowns ("userID" TEXT PRIMARY KEY, "lastMoraTime" BIGINT)`);
            const cdRes = await db.query('SELECT "lastMoraTime" FROM ai_cooldowns WHERE "userID" = $1', [userId]);
            const cooldownData = cdRes.rows[0];
            const oneHour = 60 * 60 * 1000;
            if (cooldownData && (Date.now() - parseInt(cooldownData.lastMoraTime || cooldownData.lastmoratime)) < oneHour) {
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
            if (messageObject && db) {
                response = await detectAndExecuteCommands(messageObject, response, db);
            }
            response = sanitizeOutput(response);
        }

        if (response && messageObject && db) { 
            try {
                const client = messageObject.client;
                
                const nowKSA = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Riyadh" }));
                const dateStr = nowKSA.toLocaleDateString('en-CA'); 
                
                let dailyIdToUse = `${userId}-${guildId}-${dateStr}`;
                const dailyRes = await db.query('SELECT "id" FROM user_daily_stats WHERE "userID" = $1 AND "guildID" = $2 AND "date" = $3', [userId, guildId, dateStr]);
                let daily = dailyRes.rows[0];
                
                if (daily) {
                    await db.query('UPDATE user_daily_stats SET "ai_interactions" = "ai_interactions" + 1 WHERE "id" = $1', [daily.id]);
                    dailyIdToUse = daily.id;
                } else {
                    try { await db.query('INSERT INTO user_daily_stats ("id", "userID", "guildID", "date", "ai_interactions") VALUES ($1, $2, $3, $4, 1) ON CONFLICT ("id") DO NOTHING', [dailyIdToUse, userId, guildId, dateStr]); } catch (e) { }
                }

                let totalIdToUse = `${userId}-${guildId}`;
                const totalRes = await db.query('SELECT "id" FROM user_total_stats WHERE "userID" = $1 AND "guildID" = $2', [userId, guildId]);
                let total = totalRes.rows[0];
                
                if (total) {
                    await db.query('UPDATE user_total_stats SET "total_ai_interactions" = "total_ai_interactions" + 1 WHERE "userID" = $1 AND "guildID" = $2', [userId, guildId]);
                    totalIdToUse = total.id;
                } else {
                    await db.query('INSERT INTO user_total_stats ("id", "userID", "guildID", "total_ai_interactions") VALUES ($1, $2, $3, 1) ON CONFLICT ("id") DO NOTHING', [totalIdToUse, userId, guildId]);
                }

                if (client && typeof client.checkQuests === 'function') {
                    const updatedDailyStatsRes = await db.query('SELECT * FROM user_daily_stats WHERE "id" = $1', [dailyIdToUse]);
                    const updatedDailyStats = updatedDailyStatsRes.rows[0];
                    
                    const updatedTotalStatsRes = await db.query('SELECT * FROM user_total_stats WHERE "id" = $1', [totalIdToUse]);
                    const updatedTotalStats = updatedTotalStatsRes.rows[0];

                    if (updatedDailyStats) await client.checkQuests(client, messageObject.member, updatedDailyStats, 'daily', dateStr);
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
