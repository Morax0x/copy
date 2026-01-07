const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require("discord.js");
const path = require('path');

// 1. تحديد المسار الجذري
const rootDir = process.cwd();

// 2. استدعاء ملف الإعدادات
const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));

// 3. استدعاء دوال الـ PvP
let pvpCore;
try {
    pvpCore = require(path.join(rootDir, 'handlers', 'pvp-core.js'));
} catch (e) {
    console.error("[Fish Cmd] Error loading pvp-core.js:", e.message);
    pvpCore = {}; 
}

// 4. دوال احتياطية
if (typeof pvpCore.getWeaponData !== 'function') pvpCore.getWeaponData = () => ({ name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 });
if (typeof pvpCore.getUserActiveSkill !== 'function') pvpCore.getUserActiveSkill = () => null;
if (typeof pvpCore.startPveBattle !== 'function') pvpCore.startPveBattle = async (i) => { await i.followUp({ content: "⚠️ حدث خطأ: نظام القتال غير جاهز.", flags: [MessageFlags.Ephemeral] }); };

// استخراج البيانات (Cache) لتسريع الوصول
const fishItems = fishingConfig.fishItems;
const rodsConfig = fishingConfig.rods;
const boatsConfig = fishingConfig.boats;
const locationsConfig = fishingConfig.locations;
const monstersConfig = fishingConfig.monsters || [];

const OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';

// 🔥 خيارات الأسهم (ثابتة)
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

// 🔥 Set لتخزين اللاعبين النشطين (في الذاكرة)
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

        // 1. الحماية من التكرار
        if (activeFishingSessions.has(user.id)) {
            return reply({ content: "⚠️ **لديك رحلة صيد جارية!**", ephemeral: true });
        }

        // 2. جلب البيانات بسرعة
        let userData = client.getLevel.get(user.id, guild.id);
        if (!userData) {
            userData = { ...client.defaultData, user: user.id, guild: guild.id, rodLevel: 1, boatLevel: 1, currentLocation: 'beach', lastFish: 0 };
            client.setLevel.run(userData);
        }

        // 3. التحقق من الكولداون قبل أي شيء
        const now = Date.now();
        const currentRod = rodsConfig.find(r => r.level === (userData.rodLevel || 1)) || rodsConfig[0];
        const currentBoat = boatsConfig.find(b => b.level === (userData.boatLevel || 1)) || boatsConfig[0];
        let cooldown = currentRod.cooldown - (currentBoat.speed_bonus || 0);
        if (cooldown < 10000) cooldown = 10000;

        const lastFish = userData.lastFish || 0;
        if (user.id !== OWNER_ID && (now - lastFish < cooldown)) {
            const remaining = lastFish + cooldown - now;
            const minutes = Math.floor((remaining % 3600000) / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            return reply({ content: `قمـت بالصيـد مؤخـرا انتـظـر **${minutes}:${seconds}** لتـذهب للصيـد مجددا` });
        }

        // 4. التحقق من الجرح (Debuff)
        const woundedDebuff = sql.prepare("SELECT expiresAt FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'pvp_wounded' AND expiresAt > ?").get(user.id, guild.id, now);
        if (woundedDebuff) {
            const minutesLeft = Math.ceil((woundedDebuff.expiresAt - now) / 60000);
            return reply({ content: `🩹 | أنت **جريح** حالياً! عليك الراحة لمدة **${minutesLeft}** دقيقة.`, flags: [MessageFlags.Ephemeral] });
        }

        const locationId = userData.currentLocation || 'beach';
        const currentLocation = locationsConfig.find(l => l.id === locationId) || locationsConfig[0];

        // 5. استهلاك الطعم (عملية DB واحدة سريعة)
        let usedBaitName = null;
        let baitLuckBonus = 0;
        const userBaits = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ?").all(user.id, guild.id);
        const availableBaits = userBaits.filter(invItem => fishingConfig.baits.some(b => b.id === invItem.itemID && invItem.quantity > 0));

        if (availableBaits.length > 0) {
            const richBaits = availableBaits.map(invItem => {
                const config = fishingConfig.baits.find(b => b.id === invItem.itemID);
                return { ...invItem, luck: config.luck, name: config.name };
            });
            richBaits.sort((a, b) => b.luck - a.luck);
            const bestBait = richBaits[0];
            usedBaitName = bestBait.name;
            baitLuckBonus = bestBait.luck;
            if (bestBait.quantity > 1) sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE id = ?").run(bestBait.id);
            else sql.prepare("DELETE FROM user_inventory WHERE id = ?").run(bestBait.id);
        }

        // بدء الجلسة
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
            // 🔥 إعداد لعبة الأسهم (Arrows) 🔥
            
            // 🔥🔥🔥 تعديل عدد الأزرار (Sequence Length) 🔥🔥🔥
            let requiredSequenceLength = 1; // لفل 1 = زر واحد
            if (currentRod.level === 2) requiredSequenceLength = 2; // لفل 2 = زرين
            if (currentRod.level >= 3) requiredSequenceLength = 3; // لفل 3 وفوق = 3 أزرار

            // إنشاء تسلسل عشوائي من الأسهم
            const sequence = [];
            for(let k=0; k<requiredSequenceLength; k++) {
                sequence.push(ARROW_GAME_OPTIONS[Math.floor(Math.random() * ARROW_GAME_OPTIONS.length)]);
            }

            // إنشاء صف الأزرار (ثابت: فوق، تحت، يسار، يمين)
            const gameRow = new ActionRowBuilder();
            ARROW_GAME_OPTIONS.forEach(btn => {
                gameRow.addComponents(
                    new ButtonBuilder().setCustomId(`fish_click_${btn.id}`).setEmoji(btn.emoji).setStyle(ButtonStyle.Secondary)
                );
            });

            // عرض التسلسل المطلوب
            const sequenceEmojis = sequence.map(s => s.emoji).join('  ');
            
            const biteEmbed = new EmbedBuilder()
                .setTitle("🎣 السنارة تسحب بقوة!")
                .setDescription(`**وازن السنارة واضغط الأسهم بالترتيب:**\n# ${sequenceEmojis}`)
                .setColor(Colors.Orange);

            try {
                // 🔥🔥🔥 تعديل: إضافة الأسهم في النص فوق الايمبد 🔥🔥🔥
                const updatePayload = { 
                    content: `**${sequenceEmojis}**`, 
                    embeds: [biteEmbed], 
                    components: [gameRow] 
                };
                if (isSlash) await interactionOrMessage.editReply(updatePayload);
                else await msg.edit(updatePayload);
            } catch (error) {
                activeFishingSessions.delete(user.id);
                return; 
            }

            // 🔥🔥🔥 تعديل وقت الاستجابة (Reaction Time) 🔥🔥🔥
            let reactionTime = 13000; // الافتراضي للمستويات العالية (5+)
            
            if (currentRod.level === 1) {
                reactionTime = 5000;      // مستوى 1: 5 ثواني
            } else if (currentRod.level === 2) {
                reactionTime = 8000;      // مستوى 2: 8 ثواني
            } else if (currentRod.level >= 3 && currentRod.level <= 4) {
                reactionTime = 10000;     // مستوى 3-4: 10 ثواني
            }

            const pullCollector = msg.createMessageComponentCollector({ 
                filter: j => j.user.id === user.id && j.customId.startsWith('fish_click_'), 
                time: reactionTime, 
                max: requiredSequenceLength 
            }); 

            let currentStep = 0;
            let failed = false;

            pullCollector.on('collect', async j => {
                await j.deferUpdate();
                
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
                    
                    sql.prepare("UPDATE levels SET lastFish = ? WHERE user = ? AND guild = ?").run(Date.now(), user.id, guild.id);
                    activeFishingSessions.delete(user.id);
                    
                    // إخفاء النص من فوق عند الفشل
                    await j.editReply({ content: '', embeds: [failEmbed], components: [] });
                    return;
                }

                currentStep++;
                
                if (currentStep === requiredSequenceLength) {
                    pullCollector.stop('success');
                    
                    // --- منطق الفوز ---
                    const isOwner = user.id === OWNER_ID;
                    const monsterChance = isOwner ? 0.50 : (0.10 + (baitLuckBonus / 1000));
                    const monsterTriggered = Math.random() < monsterChance;
                    let possibleMonsters = monstersConfig.filter(m => m.locations.includes(locationId));
                    if (isOwner && possibleMonsters.length === 0) possibleMonsters = monstersConfig; 
                    
                    if (possibleMonsters.length > 0 && monsterTriggered) {
                        const monster = possibleMonsters[Math.floor(Math.random() * possibleMonsters.length)];
                        let playerWeapon = pvpCore.getWeaponData(sql, j.member);
                        if (!playerWeapon || playerWeapon.currentLevel === 0) playerWeapon = { name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 };

                        if (pvpCore.startPveBattle) {
                            activeFishingSessions.delete(user.id);
                            // إزالة النص عند ظهور الوحش
                            await j.editReply({ content: '' }); 
                            await pvpCore.startPveBattle(j, client, sql, j.member, monster, playerWeapon);
                            return; 
                        }
                    }

                    const totalLuck = (currentRod.luck_bonus || 0) + baitLuckBonus;
                    const fishCount = Math.floor(Math.random() * currentRod.max_fish) + 1;
                    let caughtFish = [];
                    let totalValue = 0;
                    const allowedRarities = currentLocation.fish_types;
                    const maxRarity = currentRod.max_rarity || 2;

                    const transaction = sql.transaction(() => {
                        const addFishStmt = sql.prepare(`INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + ?`);
                        
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
                                addFishStmt.run(guild.id, user.id, bestFish.id, 1, 1);
                            }
                        }
                        
                        sql.prepare("UPDATE levels SET mora = mora + ?, lastFish = ? WHERE user = ? AND guild = ?").run(totalValue, Date.now(), user.id, guild.id);
                    });
                    
                    transaction(); 

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

                    const resultEmbed = new EmbedBuilder()
                        .setTitle(`✥ رحـلـة صيـد فـي المحيـط !`) 
                        .setDescription(description)
                        .setColor(Colors.Green)
                        .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png')
                        .setFooter({ text: `السنارة: ${currentRod.name}` });

                    activeFishingSessions.delete(user.id);
                    // إزالة النص عند الفوز وعرض النتيجة
                    await j.editReply({ content: '', embeds: [resultEmbed], components: [] });
                }
            });

            pullCollector.on('end', async (collected, reason) => {
                try {
                    if (reason !== 'success' && reason !== 'wrong_input') {
                        const failEmbed = new EmbedBuilder()
                            .setTitle("💨 هربت السمكة!")
                            .setDescription("كنت بطيئاً جداً! حاول أن تكون أسرع في المرة القادمة.")
                            .setColor(Colors.Red);
                        
                        sql.prepare("UPDATE levels SET lastFish = ? WHERE user = ? AND guild = ?").run(Date.now(), user.id, guild.id);
                        
                        // إزالة النص عند انتهاء الوقت
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
