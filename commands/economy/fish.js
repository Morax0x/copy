const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, AttachmentBuilder } = require("discord.js");
const path = require('path');

// استدعاء محرك الرسم الجديد!
const { generateFishingCard } = require('../../generators/fishing-card-generator.js');

let updateGuildStat;
try {
    ({ updateGuildStat } = require('../../handlers/guild-board-handler.js'));
} catch (e) {}

const rootDir = process.cwd();
const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));

let pvpCore;
try {
    pvpCore = require(path.join(rootDir, 'handlers', 'pvp-core.js'));
} catch (e) {
    pvpCore = {}; 
}

if (typeof pvpCore.getWeaponData !== 'function') pvpCore.getWeaponData = () => ({ name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 });
if (typeof pvpCore.getUserActiveSkill !== 'function') pvpCore.getUserActiveSkill = () => null;
if (typeof pvpCore.startPveBattle !== 'function') pvpCore.startPveBattle = async (i) => { await i.followUp({ content: "⚠️ حدث خطأ: نظام القتال غير جاهز.", flags: [MessageFlags.Ephemeral] }); };

const fishItems = fishingConfig.fishItems || [];
const rodsConfig = fishingConfig.rods || [];
const boatsConfig = fishingConfig.boats || [];
const locationsConfig = fishingConfig.locations || [];
const monstersConfig = fishingConfig.monsters || [];

const OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';

const activeFishingSessions = new Set();

module.exports = {
    data: new SlashCommandBuilder().setName('صيد').setDescription('ابـدأ رحـلـة صيد تفاعلية جديدة'),
    name: 'fish',
    aliases: ['صيد', 'ص', 'fishing'],
    category: "Economy",
    description: "صيد الأسماك بنظام الشد والجذب الرسومي.",

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guild = isSlash ? interactionOrMessage.guild : interactionOrMessage.guild;
        const client = interactionOrMessage.client;
        const sql = client.sql;

        const reply = async (payload) => {
            if (payload.ephemeral) { delete payload.ephemeral; payload.flags = [MessageFlags.Ephemeral]; }
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply({ ...payload, fetchReply: true }); 
            }
            return interactionOrMessage.reply(payload);
        };

        if (activeFishingSessions.has(user.id)) {
            return reply({ content: "⚠️ **لديك رحلة صيد جارية!** ركز على سنارتك.", ephemeral: true });
        }

        let userDataRes;
        try { userDataRes = await sql.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [user.id, guild.id]); }
        catch(e) { userDataRes = await sql.query('SELECT * FROM levels WHERE userid = $1 AND guildid = $2', [user.id, guild.id]).catch(()=>({rows:[]})); }
        
        let userData = userDataRes.rows[0];

        if (!userData) {
            userData = { user: user.id, guild: guild.id, rodLevel: 1, boatLevel: 1, currentLocation: 'beach', lastFish: 0 };
            try { await sql.query('INSERT INTO levels ("user", "guild", "rodLevel", "boatLevel", "currentLocation", "lastFish") VALUES ($1, $2, 1, 1, $3, $4)', [user.id, guild.id, 'beach', '0']); }
            catch(e) { await sql.query('INSERT INTO levels (userid, guildid, rodlevel, boatlevel, currentlocation, lastfish) VALUES ($1, $2, 1, 1, $3, $4)', [user.id, guild.id, 'beach', '0']).catch(()=>{}); }
        }

        const now = Date.now();
        const nowStr = String(now);
        const cooldown = 3600000; 
        const lastFish = Number(userData.lastFish || userData.lastfish) || 0;
        
        if (user.id !== OWNER_ID && (now - lastFish < cooldown)) {
            const remaining = lastFish + cooldown - now;
            const minutes = Math.floor((remaining % 3600000) / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            return reply({ content: `⏳ رميت السنارة مؤخراً! الأسماك حذرة الآن، انتظر **${minutes}:${seconds}** دقيقة لتعود للصيد.` });
        }

        let woundedDebuffRes;
        try { woundedDebuffRes = await sql.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [user.id, guild.id, now]); }
        catch(e) { woundedDebuffRes = await sql.query(`SELECT expiresat FROM user_buffs WHERE userid = $1 AND guildid = $2 AND bufftype = 'pvp_wounded' AND expiresat > $3`, [user.id, guild.id, now]).catch(()=>({rows:[]})); }
        
        const woundedDebuff = woundedDebuffRes.rows[0];
        if (woundedDebuff) {
            const minutesLeft = Math.ceil((Number(woundedDebuff.expiresAt || woundedDebuff.expiresat) - now) / 60000);
            return reply({ content: `🩹 | أنت **جريح** حالياً! عليك الراحة لمدة **${minutesLeft}** دقيقة.`, flags: [MessageFlags.Ephemeral] });
        }

        if (user.id !== OWNER_ID) {
            try {
                await sql.query(`UPDATE levels SET "lastFish" = $1 WHERE "user" = $2 AND "guild" = $3`, [nowStr, user.id, guild.id]);
            } catch (err) {
                await sql.query(`UPDATE levels SET lastfish = $1 WHERE userid = $2 AND guildid = $3`, [nowStr, user.id, guild.id]).catch(()=>{});
            }
            if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                let cacheData = await client.getLevel(user.id, guild.id);
                if (cacheData) { cacheData.lastFish = nowStr; await client.setLevel(cacheData); }
            }
        }

        const currentRod = rodsConfig.find(r => r.level === (Number(userData.rodLevel || userData.rodlevel) || 1)) || rodsConfig[0];
        const currentBoat = boatsConfig.find(b => b.level === (Number(userData.boatLevel || userData.boatlevel) || 1)) || boatsConfig[0];
        const locationId = userData.currentLocation || userData.currentlocation || 'beach';
        const currentLocation = locationsConfig.find(l => l.id === locationId) || locationsConfig[0];

        let usedBaitName = null;
        let baitLuckBonus = 0;
        
        let userBaitsRes;
        try { userBaitsRes = await sql.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]); }
        catch(e) { userBaitsRes = await sql.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guild.id]).catch(()=>({rows:[]})); }
        
        const userBaits = userBaitsRes.rows;
        const availableBaits = userBaits.filter(invItem => fishingConfig.baits.some(b => b.id === (invItem.itemID || invItem.itemid) && Number(invItem.quantity) > 0));

        if (availableBaits.length > 0) {
            const richBaits = availableBaits.map(invItem => {
                const config = fishingConfig.baits.find(b => b.id === (invItem.itemID || invItem.itemid));
                return { ...invItem, luck: config.luck, name: config.name };
            });
            richBaits.sort((a, b) => b.luck - a.luck);
            const bestBait = richBaits[0];
            usedBaitName = bestBait.name;
            baitLuckBonus = bestBait.luck;
            
            try {
                if (Number(bestBait.quantity) > 1) await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "id" = $1`, [bestBait.id]);
                else await sql.query(`DELETE FROM user_inventory WHERE "id" = $1`, [bestBait.id]);
            } catch(e) {
                if (Number(bestBait.quantity) > 1) await sql.query(`UPDATE user_inventory SET quantity = quantity - 1 WHERE id = $1`, [bestBait.id]).catch(()=>{});
                else await sql.query(`DELETE FROM user_inventory WHERE id = $1`, [bestBait.id]).catch(()=>{});
            }
        }

        activeFishingSessions.add(user.id);
        if (isSlash) await interactionOrMessage.deferReply();

        let desc = `**العدة:** 🎣 ${currentRod.name} | 🚤 ${currentBoat.name}\n🌊 **الموقع:** ${currentLocation.name}`;
        desc += usedBaitName ? `\n🪱 **الطعم:** ${usedBaitName}` : `\n🪱 **الطعم:** لا يوجد`; 

        const loadingMsg = await reply({ content: `**🌊 يرمي السنارة في الماء...**\n${desc}` });

        const waitTime = Math.floor(Math.random() * 3000) + 2000; 

        setTimeout(async () => {
            let gameData = {
                distance: 100, 
                tension: 10,   
                statusText: "عـلـقـت سمـكـة! اسـحـب الآن!",
                maxTension: 100 + (currentRod.level * 10), 
            };

            const getControlRows = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('fish_hard').setLabel('سحب قوي').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                    new ButtonBuilder().setCustomId('fish_steady').setLabel('سحب متوازن').setStyle(ButtonStyle.Primary).setEmoji('🟡'),
                    new ButtonBuilder().setCustomId('fish_relax').setLabel('إرخاء الخيط').setStyle(ButtonStyle.Success).setEmoji('🟢')
                );
            };

            const sendUpdate = async (isFinal = false) => {
                try {
                    const imgBuffer = await generateFishingCard(Math.min((gameData.tension / gameData.maxTension) * 100, 100), gameData.distance, gameData.statusText);
                    const attachment = new AttachmentBuilder(imgBuffer, { name: 'fishing-game.png' });
                    
                    const updatePayload = {
                        content: `<@${user.id}> **انتبه للعداد والمسافة!**`,
                        files: [attachment],
                        components: isFinal ? [] : [getControlRows()]
                    };
                    
                    if (isSlash) await interactionOrMessage.editReply(updatePayload).catch(()=>{});
                    else await loadingMsg.edit(updatePayload).catch(()=>{});
                } catch(err) {
                    console.error("Error generating fishing card:", err);
                }
            };

            await sendUpdate();

            const collector = (isSlash ? interactionOrMessage : loadingMsg).createMessageComponentCollector({
                filter: i => i.user.id === user.id && i.customId.startsWith('fish_'),
                time: 60000 
            });

            collector.on('collect', async i => {
                await i.deferUpdate().catch(()=>{});

                if (i.customId === 'fish_hard') {
                    gameData.distance -= Math.floor(Math.random() * 15) + 15; 
                    gameData.tension += Math.floor(Math.random() * 20) + 20; 
                    gameData.statusText = "سحب عنيف! الخيط يهتز!";
                } else if (i.customId === 'fish_steady') {
                    gameData.distance -= Math.floor(Math.random() * 10) + 5; 
                    gameData.tension += Math.floor(Math.random() * 10) + 5; 
                    gameData.statusText = "سحب متوازن.. السمكة تقترب.";
                } else if (i.customId === 'fish_relax') {
                    gameData.distance += Math.floor(Math.random() * 15) + 5; 
                    gameData.tension -= Math.floor(Math.random() * 30) + 20; 
                    gameData.statusText = "إرخاء الخيط! السمكة تبتعد لتستريح.";
                }

                const fishAI = Math.random();
                if (fishAI > 0.6) {
                    gameData.tension += 15;
                    gameData.statusText += " (تقاوم!)";
                }

                if (gameData.tension < 0) gameData.tension = 0;
                if (gameData.distance < 0) gameData.distance = 0;

                if (gameData.tension >= gameData.maxTension) {
                    gameData.statusText = "💥 انقطع الخيط! هربت السمكة...";
                    await sendUpdate(true);
                    collector.stop('snapped');
                    return;
                }
                
                if (gameData.distance >= 120) {
                    gameData.statusText = "💨 السمكة ابتعدت جداً وأفلتت السنارة!";
                    await sendUpdate(true);
                    collector.stop('escaped');
                    return;
                }

                if (gameData.distance <= 0) {
                    gameData.statusText = "✅ تم الصيد بنجاح!";
                    await sendUpdate(true);
                    collector.stop('success');
                    return;
                }

                await sendUpdate();
            });

            collector.on('end', async (collected, reason) => {
                try {
                    if (reason === 'time') {
                        gameData.statusText = "⏳ انتهى الوقت! السمكة هربت.";
                        await sendUpdate(true); 
                    }
                    
                    if (reason === 'success') {
                        const isOwner = user.id === OWNER_ID;
                        const monsterChance = isOwner ? 0.50 : (0.10 + (baitLuckBonus / 1000));
                        const monsterTriggered = Math.random() < monsterChance;
                        let possibleMonsters = monstersConfig.filter(m => m.locations.includes(locationId));
                        if (isOwner && possibleMonsters.length === 0) possibleMonsters = monstersConfig; 
                        
                        if (possibleMonsters.length > 0 && monsterTriggered) {
                            const monster = possibleMonsters[Math.floor(Math.random() * possibleMonsters.length)];
                            let playerWeapon = await pvpCore.getWeaponData(sql, (isSlash ? interactionOrMessage.member : message.member));
                            if (!playerWeapon || playerWeapon.currentLevel === 0) playerWeapon = { name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 };

                            if (pvpCore.startPveBattle) {
                                activeFishingSessions.delete(user.id);
                                const iObject = isSlash ? interactionOrMessage : message;
                                await pvpCore.startPveBattle(iObject, client, sql, (isSlash ? interactionOrMessage.member : message.member), monster, playerWeapon);
                                return; 
                            }
                        }

                        let isFisherKing = false;
                        try {
                            const settingsRes = await sql.query(`SELECT "roleFisherKing" FROM settings WHERE "guild" = $1`, [guild.id]);
                            const settings = settingsRes.rows[0];
                            if (settings && (settings.roleFisherKing || settings.rolefisherking) && (isSlash ? interactionOrMessage.member : message.member).roles.cache.has(settings.roleFisherKing || settings.rolefisherking)) {
                                isFisherKing = true;
                            }
                        } catch (e) {}

                        let totalLuck = (currentRod.luck_bonus || 0) + baitLuckBonus;
                        let kingBuffText = "";
                        if (isFisherKing) {
                            totalLuck += 20;
                            kingBuffText = "\n👑 **بركة ملك القنص:** حظ الصيد +20%";
                        }

                        const fishCount = Math.floor(Math.random() * currentRod.max_fish) + 1;
                        let caughtFish = [];
                        let totalValue = 0;
                        const allowedRarities = currentLocation.fish_types || [1, 2];
                        const maxRarity = currentRod.max_rarity || 2;

                        for (let k = 0; k < fishCount; k++) {
                            const rerolls = 1 + Math.floor(totalLuck / 20);
                            let bestFish = null;
                            for(let r=0; r<rerolls; r++) {
                                let rarity = allowedRarities[Math.floor(Math.random() * allowedRarities.length)];
                                if (rarity > maxRarity) rarity = maxRarity;
                                const possibleFishList = fishItems.filter(f => f.rarity === rarity);
                                if (possibleFishList.length > 0) {
                                    const candidate = possibleFishList[Math.floor(Math.random() * possibleFishList.length)];
                                    if (!bestFish || (candidate.rarity > bestFish.rarity || (candidate.rarity === bestFish.rarity && candidate.price > bestFish.price))) {
                                        bestFish = candidate;
                                    }
                                }
                            }
                            if (bestFish) {
                                caughtFish.push(bestFish);
                                totalValue += bestFish.price;
                                try { await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [guild.id, user.id, bestFish.id]); }
                                catch(e) { await sql.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT(guildid, userid, itemid) DO UPDATE SET quantity = user_inventory.quantity + 1`, [guild.id, user.id, bestFish.id]).catch(()=>{}); }
                            }
                        }
                        
                        try { await sql.query(`UPDATE levels SET "mora" = COALESCE("mora", 0) + CAST($1 AS BIGINT) WHERE "user" = $2 AND "guild" = $3`, [String(totalValue), user.id, guild.id]); }
                        catch(e) { await sql.query(`UPDATE levels SET mora = COALESCE(mora, 0) + CAST($1 AS BIGINT) WHERE userid = $2 AND guildid = $3`, [String(totalValue), user.id, guild.id]).catch(()=>{}); }
                        
                        if (typeof client.getLevel === 'function' && typeof client.setLevel === 'function') {
                            let cache = await client.getLevel(user.id, guild.id);
                            if (cache) {
                                cache.mora = String(Number(cache.mora || 0) + totalValue);
                                await client.setLevel(cache);
                            }
                        }
                        
                        try {
                            if (updateGuildStat) await updateGuildStat(client, guild.id, user.id, 'fish_caught', caughtFish.length);
                        } catch(err) { console.error("Guild Stat Error", err); }

                        const summary = {};
                        caughtFish.forEach(f => {
                            summary[f.name] = summary[f.name] ? { count: summary[f.name].count + 1, emoji: f.emoji, rarity: f.rarity } : { count: 1, emoji: f.emoji, rarity: f.rarity };
                        });

                        let description = "✶ قمـت بصيـد:\n";
                        if (caughtFish.length === 0) description += "لا شيء! لم يكن الحظ حليفك هذه المرة.\n";
                        
                        for (const [name, info] of Object.entries(summary)) {
                            let rarityStar = info.rarity >= 5 ? "🌟" : (info.rarity === 4 ? "✨" : "");
                            description += `✶ ${info.emoji} ${name} ${rarityStar} **x${info.count}**\n`;
                        }
                        description += `\n✶ قيـمـة الصيد: \`${totalValue.toLocaleString()}\` ${EMOJI_MORA}`;
                        description += kingBuffText;

                        const resultEmbed = new EmbedBuilder()
                            .setTitle(`✥ الغنيمــة !`) 
                            .setDescription(description)
                            .setColor(Colors.Green)
                            .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png');

                        // 🔥 التحديث الجذري هنا للإرسال الآمن 🔥
                        if (isSlash) {
                            await interactionOrMessage.followUp({ content: `<@${user.id}>`, embeds: [resultEmbed] }).catch(console.error);
                        } else {
                            await interactionOrMessage.channel.send({ content: `<@${user.id}>`, embeds: [resultEmbed] }).catch(console.error);
                        }
                    }
                } catch (err) {
                    console.error("End Event Error in Fish:", err);
                } finally {
                    activeFishingSessions.delete(user.id);
                }
            });

        }, waitTime);
    }
};
