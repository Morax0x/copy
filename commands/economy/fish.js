const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require("discord.js");
const path = require('path');

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
    console.error("[Fish Cmd] Error loading pvp-core.js:", e.message);
    pvpCore = {}; 
}

if (typeof pvpCore.getWeaponData !== 'function') pvpCore.getWeaponData = () => ({ name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 });
if (typeof pvpCore.getUserActiveSkill !== 'function') pvpCore.getUserActiveSkill = () => null;
if (typeof pvpCore.startPveBattle !== 'function') pvpCore.startPveBattle = async (i) => { await i.followUp({ content: "⚠️ حدث خطأ: نظام القتال غير جاهز.", flags: [MessageFlags.Ephemeral] }); };

const fishItems = fishingConfig.fishItems;
const rodsConfig = fishingConfig.rods;
const boatsConfig = fishingConfig.boats;
const locationsConfig = fishingConfig.locations;
const monstersConfig = fishingConfig.monsters || [];

const OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';

const ARROW_GAME_OPTIONS = [
    { id: 'up', emoji: '⬆️', label: 'فوق' }, 
    { id: 'down', emoji: '⬇️', label: 'تحت' }, 
    { id: 'left', emoji: '⬅️', label: 'يسار' }, 
    { id: 'right', emoji: '➡️', label: 'يمين' }
];

const FISHING_GIFS = [
    "https://i.postimg.cc/CMRynd7X/DIYGl5S.gif",
    "https://i.postimg.cc/kGzfWJJm/e741917b220a9f554ea765a7c4f9294d.gif",
    "https://i.postimg.cc/VNWG2PRD/original-e9123b1d533d02beb5d566d087247ab5.gif",
    "https://i.postimg.cc/m2PnkqLb/6b22a575b0c783615c2b77e67951758c.gif",
    "https://i.postimg.cc/NMbn2v26/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f776174747061642d6d656469612d736572766963652f53746f.gif"
];

const activeFishingSessions = new Set();

module.exports = {
    data: new SlashCommandBuilder().setName('صيد').setDescription('ابـدأ رحـلـة صيد'),
    name: 'fish',
    aliases: ['صيد', 'ص', 'fishing'],
    category: "Economy",
    description: "صيد الأسماك مع مواجهات وحوش.",

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
            return reply({ content: "⚠️ **لديك رحلة صيد جارية!**", ephemeral: true });
        }

        let userDataRes = await sql.query('SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2', [user.id, guild.id]);
        let userData = userDataRes.rows[0];

        if (!userData) {
            userData = { user: user.id, guild: guild.id, rodLevel: 1, boatLevel: 1, currentLocation: 'beach', lastFish: 0 };
            await sql.query('INSERT INTO levels ("user", "guild", "rodLevel", "boatLevel", "currentLocation", "lastFish") VALUES ($1, $2, 1, 1, $3, 0)', [user.id, guild.id, 'beach']);
        }

        const now = Date.now();
        // 🔥 تم تثبيت وقت الانتظار إلى ساعة واحدة (3,600,000 مللي ثانية) لجميع اللاعبين
        const cooldown = 3600000; 

        const lastFish = Number(userData.lastFish || userData.lastfish) || 0;
        if (user.id !== OWNER_ID && (now - lastFish < cooldown)) {
            const remaining = lastFish + cooldown - now;
            const minutes = Math.floor((remaining % 3600000) / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            return reply({ content: `قمـت بالصيـد مؤخـرا انتـظـر **${minutes}:${seconds}** لتـذهب للصيـد مجددا` });
        }

        const woundedDebuffRes = await sql.query(`SELECT "expiresAt" FROM user_buffs WHERE "userID" = $1 AND "guildID" = $2 AND "buffType" = 'pvp_wounded' AND "expiresAt" > $3`, [user.id, guild.id, now]);
        const woundedDebuff = woundedDebuffRes.rows[0];
        
        if (woundedDebuff) {
            const minutesLeft = Math.ceil((Number(woundedDebuff.expiresAt || woundedDebuff.expiresat) - now) / 60000);
            return reply({ content: `🩹 | أنت **جريح** حالياً! عليك الراحة لمدة **${minutesLeft}** دقيقة.`, flags: [MessageFlags.Ephemeral] });
        }

        const currentRod = rodsConfig.find(r => r.level === (Number(userData.rodLevel || userData.rodlevel) || 1)) || rodsConfig[0];
        const currentBoat = boatsConfig.find(b => b.level === (Number(userData.boatLevel || userData.boatlevel) || 1)) || boatsConfig[0];
        const locationId = userData.currentLocation || userData.currentlocation || 'beach';
        const currentLocation = locationsConfig.find(l => l.id === locationId) || locationsConfig[0];

        let usedBaitName = null;
        let baitLuckBonus = 0;
        
        const userBaitsRes = await sql.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guild.id]);
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
            
            if (Number(bestBait.quantity) > 1) {
                await sql.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "id" = $1`, [bestBait.id]);
            } else {
                await sql.query(`DELETE FROM user_inventory WHERE "id" = $1`, [bestBait.id]);
            }
        }

        activeFishingSessions.add(user.id);
        if (isSlash) await interactionOrMessage.deferReply();

        const randomGif = FISHING_GIFS[Math.floor(Math.random() * FISHING_GIFS.length)];
        let desc = `**العدة:** 🎣 ${currentRod.name} | 🚤 ${currentBoat.name}\n🌊 **الموقع:** ${currentLocation.name}`;
        
        if (usedBaitName) {
            desc += `\n🪱 **الطعم:** ${usedBaitName}`;
        } else {
            desc += `\n🪱 **الطعم:** لا يوجد`; 
        }

        const waitingEmbed = new EmbedBuilder()
            .setTitle(`🎣 رحلة صيد: ${currentLocation.name}`)
            .setDescription(desc + "\n\n🌊 **السنارة في الماء...**\nانتظر... لا تسحب السنارة حتى تشعر بالاهتزاز!")
            .setColor(Colors.Blue)
            .setImage(randomGif);

        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('pull_rod_placeholder').setLabel('...').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );

        let msg;
        try {
            msg = await reply({ 
                embeds: [waitingEmbed], 
                components: [disabledRow] 
            });
        } catch (err) {
            activeFishingSessions.delete(user.id);
            return;
        }

        const waitTime = Math.floor(Math.random() * 3000) + 3500; 

        setTimeout(async () => {
            let requiredSequenceLength = 1; 
            if (currentRod.level === 2) requiredSequenceLength = 2; 
            if (currentRod.level >= 3) requiredSequenceLength = 3; 

            const sequence = [];
            for(let k=0; k<requiredSequenceLength; k++) {
                sequence.push(ARROW_GAME_OPTIONS[Math.floor(Math.random() * ARROW_GAME_OPTIONS.length)]);
            }

            const rowVertical = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fish_click_up`).setEmoji('⬆️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`fish_click_down`).setEmoji('⬇️').setStyle(ButtonStyle.Secondary)
            );
            
            const rowHorizontal = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fish_click_left`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId(`fish_click_right`).setEmoji('➡️').setStyle(ButtonStyle.Secondary)
            );

            const sequenceEmojis = sequence.map(s => s.emoji).join('  ');
            
            const biteEmbed = new EmbedBuilder()
                .setTitle("🎣 السنارة تسحب بقوة!")
                .setDescription(`**وازن السنارة واضغط الأسهم بالترتيب:**\n# ${sequenceEmojis}`)
                .setColor(Colors.Orange);

            try {
                const updatePayload = { 
                    content: `**${sequenceEmojis}**`, 
                    embeds: [biteEmbed], 
                    components: [rowVertical, rowHorizontal] 
                };
                if (isSlash) await interactionOrMessage.editReply(updatePayload);
                else await msg.edit(updatePayload);
            } catch (error) {
                activeFishingSessions.delete(user.id);
                return; 
            }

            let reactionTime = 13000; 
            
            if (currentRod.level === 1) {
                reactionTime = 5000;      
            } else if (currentRod.level === 2) {
                reactionTime = 8000;      
            } else if (currentRod.level >= 3 && currentRod.level <= 4) {
                reactionTime = 10000;     
            }

            const pullCollector = msg.createMessageComponentCollector({ 
                filter: j => j.user.id === user.id && j.customId.startsWith('fish_click_'), 
                time: reactionTime, 
                max: requiredSequenceLength 
            }); 

            let currentStep = 0;
            let failed = false;

            pullCollector.on('collect', async j => {
                await j.deferUpdate().catch(()=>{});
                
                if (failed) return; 

                const clickedBtnId = j.customId.replace('fish_click_', '');
                const expectedBtn = sequence[currentStep];

                if (clickedBtnId !== expectedBtn.id) {
                    failed = true;
                    pullCollector.stop('wrong_input');
                    
                    const clickedButtonObj = ARROW_GAME_OPTIONS.find(c => c.id === clickedBtnId);
                    const wrongEmoji = clickedButtonObj ? clickedButtonObj.emoji : '❓';
                    
                    const failEmbed = new EmbedBuilder()
                        .setTitle("❌ انقطع الخيط!")
                        .setDescription(`ضغطت ${wrongEmoji} والمطلوب كان ${expectedBtn.emoji}\nحاول التركيز أكثر!`)
                        .setColor(Colors.Red);
                    
                    await sql.query(`UPDATE levels SET "lastFish" = $1 WHERE "user" = $2 AND "guild" = $3`, [String(Date.now()), user.id, guild.id]);
                    activeFishingSessions.delete(user.id);
                    
                    await j.editReply({ content: '', embeds: [failEmbed], components: [] }).catch(()=>{});
                    return;
                }

                currentStep++;
                
                if (currentStep === requiredSequenceLength) {
                    pullCollector.stop('success');
                    
                    const isOwner = user.id === OWNER_ID;
                    const monsterChance = isOwner ? 0.50 : (0.10 + (baitLuckBonus / 1000));
                    const monsterTriggered = Math.random() < monsterChance;
                    let possibleMonsters = monstersConfig.filter(m => m.locations.includes(locationId));
                    if (isOwner && possibleMonsters.length === 0) possibleMonsters = monstersConfig; 
                    
                    if (possibleMonsters.length > 0 && monsterTriggered) {
                        const monster = possibleMonsters[Math.floor(Math.random() * possibleMonsters.length)];
                        let playerWeapon = await pvpCore.getWeaponData(sql, j.member);
                        if (!playerWeapon || playerWeapon.currentLevel === 0) playerWeapon = { name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 };

                        if (pvpCore.startPveBattle) {
                            activeFishingSessions.delete(user.id);
                            await j.editReply({ content: '' }).catch(()=>{}); 
                            await pvpCore.startPveBattle(j, client, sql, j.member, monster, playerWeapon);
                            return; 
                        }
                    }

                    let isFisherKing = false;
                    try {
                        const settingsRes = await sql.query(`SELECT "roleFisherKing" FROM settings WHERE "guild" = $1`, [guild.id]);
                        const settings = settingsRes.rows[0];
                        if (settings && (settings.roleFisherKing || settings.rolefisherking) && j.member.roles.cache.has(settings.roleFisherKing || settings.rolefisherking)) {
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
                    const allowedRarities = currentLocation.fish_types;
                    const maxRarity = currentRod.max_rarity || 2;

                    try {
                        await sql.query("BEGIN");
                        
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
                                await sql.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("guildID", "userID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [guild.id, user.id, bestFish.id]);
                            }
                        }
                        
                        await sql.query(`UPDATE levels SET "mora" = CAST("mora" AS BIGINT) + $1, "lastFish" = $2 WHERE "user" = $3 AND "guild" = $4`, [totalValue, String(Date.now()), user.id, guild.id]);
                        
                        if (updateGuildStat) {
                            updateGuildStat(client, guild.id, user.id, 'fish_caught', caughtFish.length);
                        }
                        
                        await sql.query("COMMIT");
                    } catch (e) {
                        await sql.query("ROLLBACK");
                        throw e;
                    }

                    const summary = {};
                    caughtFish.forEach(f => {
                        summary[f.name] = summary[f.name] ? { count: summary[f.name].count + 1, emoji: f.emoji, rarity: f.rarity } : { count: 1, emoji: f.emoji, rarity: f.rarity };
                    });

                    let description = "✶ قمـت بصيـد:\n";
                    for (const [name, info] of Object.entries(summary)) {
                        let rarityStar = info.rarity >= 5 ? "🌟" : (info.rarity === 4 ? "✨" : "");
                        description += `✶ ${info.emoji} ${name} ${rarityStar} **x${info.count}**\n`;
                    }
                    description += `\n✶ قيـمـة الصيد: \`${totalValue.toLocaleString()}\` ${EMOJI_MORA}`;
                    description += kingBuffText;

                    const resultEmbed = new EmbedBuilder()
                        .setTitle(`✥ رحـلـة صيـد فـي المحيـط !`) 
                        .setDescription(description)
                        .setColor(Colors.Green)
                        .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png')
                        .setFooter({ text: `السنارة: ${currentRod.name}` });

                    activeFishingSessions.delete(user.id);
                    await j.editReply({ content: '', embeds: [resultEmbed], components: [] }).catch(()=>{});
                }
            });

            pullCollector.on('end', async (collected, reason) => {
                try {
                    if (reason !== 'success' && reason !== 'wrong_input') {
                        const failEmbed = new EmbedBuilder()
                            .setTitle("💨 هربت السمكة!")
                            .setDescription("كنت بطيئاً جداً! حاول أن تكون أسرع في المرة القادمة.")
                            .setColor(Colors.Red);
                        
                        await sql.query(`UPDATE levels SET "lastFish" = $1 WHERE "user" = $2 AND "guild" = $3`, [String(Date.now()), user.id, guild.id]);
                        
                        const failPayload = { content: '', embeds: [failEmbed], components: [] };
                        if (isSlash) await interactionOrMessage.editReply(failPayload).catch(() => {});
                        else await msg.edit(failPayload).catch(() => {});
                    }
                } finally {
                    activeFishingSessions.delete(user.id);
                }
            });

        }, waitTime);
    }
};
