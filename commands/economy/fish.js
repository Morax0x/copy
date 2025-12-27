const { SlashCommandBuilder, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require("discord.js");
const path = require('path');

// 1. تحديد المسار الجذري
const rootDir = process.cwd();

// 2. استدعاء ملف الإعدادات
const fishingConfig = require(path.join(rootDir, 'json', 'fishing-config.json'));

// 3. استدعاء دوال الـ PvP بطريقة آمنة
let pvpCore;
try {
    pvpCore = require(path.join(rootDir, 'handlers', 'pvp-core.js'));
} catch (e) {
    console.error("[Fish Cmd] Error loading pvp-core.js:", e.message);
    pvpCore = {}; 
}

// 4. التأكد من وجود الدوال (Self-Healing)
if (typeof pvpCore.getWeaponData !== 'function') {
    pvpCore.getWeaponData = () => ({ name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 });
}
if (typeof pvpCore.getUserActiveSkill !== 'function') {
    pvpCore.getUserActiveSkill = () => null;
}
if (typeof pvpCore.startPveBattle !== 'function') {
    pvpCore.startPveBattle = async (i) => {
        await i.followUp({ content: "⚠️ حدث خطأ: نظام القتال غير جاهز حالياً.", flags: [MessageFlags.Ephemeral] });
    };
}

// استخراج البيانات
const fishItems = fishingConfig.fishItems;
const rodsConfig = fishingConfig.rods;
const boatsConfig = fishingConfig.boats;
const locationsConfig = fishingConfig.locations;
const monstersConfig = fishingConfig.monsters || [];

// 🔒 آيدي المالك
const OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';

// 🎨 قائمة الألوان
const COLOR_GAME_OPTIONS = [
    { id: 'red', emoji: '🔴', label: 'أحمر' }, 
    { id: 'blue', emoji: '🔵', label: 'أزرق' }, 
    { id: 'green', emoji: '🟢', label: 'أخضر' },
    { id: 'yellow', emoji: '🟡', label: 'أصفر' }, 
    { id: 'purple', emoji: '🟣', label: 'بفسجي' }, 
    { id: 'white', emoji: '⚪', label: 'أبيض' }
];

// 🎞️ قائمة صور الصيد المتحركة
const FISHING_GIFS = [
    "https://i.postimg.cc/CMRynd7X/DIYGl5S.gif",
    "https://i.postimg.cc/kGzfWJJm/e741917b220a9f554ea765a7c4f9294d.gif",
    "https://i.postimg.cc/VNWG2PRD/original-e9123b1d533d02beb5d566d087247ab5.gif",
    "https://i.postimg.cc/m2PnkqLb/6b22a575b0c783615c2b77e67951758c.gif",
    "https://i.postimg.cc/NMbn2v26/68747470733a2f2f73332e616d617a6f6e6177732e636f6d2f776174747061642d6d656469612d736572766963652f53746f.gif"
];

// 🔥🔥 القائمة المؤقتة لمنع التكرار (Anti-Spam) 🔥🔥
const activeFishingSessions = new Set();

// دالة خلط المصفوفة
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صيد')
        .setDescription('ابـدأ رحـلـة صيد'),

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
            if (payload.ephemeral) {
                delete payload.ephemeral;
                payload.flags = [MessageFlags.Ephemeral];
            }
            if (isSlash) {
                if (interactionOrMessage.deferred || interactionOrMessage.replied) return interactionOrMessage.editReply(payload);
                return interactionOrMessage.reply({ ...payload, fetchReply: true }); 
            }
            return interactionOrMessage.reply(payload);
        };

        // 🔥 1. التحقق من وجود جلسة نشطة (الحماية)
        if (activeFishingSessions.has(user.id)) {
            return reply({ 
                content: "⚠️ **لديك رحلة صيد جارية بالفعل!** لا يمكنك إرسال طلب آخر حتى تنتهي.", 
                ephemeral: true 
            });
        }

        // 2. جلب بيانات المستخدم
        let userData = client.getLevel.get(user.id, guild.id);
        if (!userData) {
            userData = { 
                ...client.defaultData, 
                user: user.id, 
                guild: guild.id, 
                rodLevel: 1, 
                boatLevel: 1,
                currentLocation: 'beach',
                lastFish: 0 
            };
            client.setLevel.run(userData);
        }

        // التحقق من الجرح
        const now = Date.now();
        const woundedDebuff = sql.prepare("SELECT * FROM user_buffs WHERE userID = ? AND guildID = ? AND buffType = 'pvp_wounded' AND expiresAt > ?").get(user.id, guild.id, now);
        if (woundedDebuff) {
            const minutesLeft = Math.ceil((woundedDebuff.expiresAt - now) / 60000);
            return reply({ 
                content: `🩹 | أنت **جريح** حالياً ولا يمكنك الصيد!\nعليك الراحة لمدة **${minutesLeft}** دقيقة حتى تشفى.`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        // تجهيز العدة
        const currentRod = rodsConfig.find(r => r.level === (userData.rodLevel || 1)) || rodsConfig[0];
        const currentBoat = boatsConfig.find(b => b.level === (userData.boatLevel || 1)) || boatsConfig[0];
        const locationId = userData.currentLocation || 'beach';
        const currentLocation = locationsConfig.find(l => l.id === locationId) || locationsConfig[0];

        // الكولداون
        let cooldown = currentRod.cooldown - (currentBoat.speed_bonus || 0);
        if (cooldown < 10000) cooldown = 10000; 

        const lastFish = userData.lastFish || 0;

        if (user.id !== OWNER_ID && (now - lastFish < cooldown)) {
            const remaining = lastFish + cooldown - now;
            const minutes = Math.floor((remaining % 3600000) / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000).toString().padStart(2, '0');
            return reply({ 
                content: `قمـت بالصيـد مؤخـرا انتـظـر **${minutes}:${seconds}** لتـذهب للصيـد مجددا`
            });
        }

        // --- البحث عن طعم ---
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
            
            // نستخدم الطعم
            usedBaitName = bestBait.name;
            baitLuckBonus = bestBait.luck;
            
            // خصم الطعم فوراً لضمان عدم التكرار
            if (bestBait.quantity > 1) sql.prepare("UPDATE user_inventory SET quantity = quantity - 1 WHERE id = ?").run(bestBait.id);
            else sql.prepare("DELETE FROM user_inventory WHERE id = ?").run(bestBait.id);
        }

        // 🔥 إضافة المستخدم للقائمة النشطة
        activeFishingSessions.add(user.id);

        if (isSlash) await interactionOrMessage.deferReply();

        // واجهة الانتظار
        const randomGif = FISHING_GIFS[Math.floor(Math.random() * FISHING_GIFS.length)];
        
        let desc = `**عدتك الحالية:**\n🎣 **السنارة:** ${currentRod.name}\n🚤 **القارب:** ${currentBoat.name}\n🌊 **المنطقة:** ${currentLocation.name}`;
        if (usedBaitName) {
            desc += `\n🪱 **الطعم:** ${usedBaitName}`;
        }

        const startEmbed = new EmbedBuilder()
            .setTitle(`🎣 رحلة صيد: ${currentLocation.name}`)
            .setColor(Colors.Blue)
            .setDescription(desc)
            .setImage(randomGif)
            .setFooter({ text: "اضغط الزر أدناه لرمي السنارة..." });

        const startRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cast_rod').setLabel('رمي السنارة').setStyle(ButtonStyle.Primary).setEmoji('🎣')
        );

        let msg;
        try {
            msg = await reply({ embeds: [startEmbed], components: [startRow] });
        } catch (err) {
            activeFishingSessions.delete(user.id);
            return;
        }

        const filter = i => i.user.id === user.id && i.customId === 'cast_rod';
        const collector = msg.createMessageComponentCollector({ filter, time: 60000, max: 1 });

        collector.on('collect', async i => {
            await i.deferUpdate();

            const waitingEmbed = new EmbedBuilder()
                .setTitle("🌊 السنارة في الماء...")
                .setDescription("انتظر... لا تسحب السنارة حتى تشعر بالاهتزاز!")
                .setColor(Colors.Grey)
                .setImage(randomGif);

            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('pull_rod').setLabel('...').setStyle(ButtonStyle.Secondary).setDisabled(true)
            );

            await i.editReply({ embeds: [waitingEmbed], components: [disabledRow] });

            // وقت انتظار عشوائي (3.5 ثانية إلى 6.5 ثانية)
            const waitTime = Math.floor(Math.random() * 3000) + 3500;

            setTimeout(async () => {
                // 🎮 إعداد لعبة الألوان (Mini-Game)
                // تحديد عدد الأزرار المطلوبة حسب مستوى السنارة
                let requiredSequenceLength = 1;
                if (currentRod.level === 2) requiredSequenceLength = 2;
                if (currentRod.level >= 3) requiredSequenceLength = 3;

                // اختيار سلسلة الألوان المطلوبة
                const sequence = [];
                for(let k=0; k<requiredSequenceLength; k++) {
                    sequence.push(COLOR_GAME_OPTIONS[Math.floor(Math.random() * COLOR_GAME_OPTIONS.length)]);
                }

                // إعداد الأزرار (خلط الألوان + إضافة ألوان إضافية للتمويه)
                let gameButtonsData = [...new Set(sequence)]; // نبدأ بالألوان المطلوبة لضمان وجودها
                // نكمل الباقي عشوائي حتى نصل لـ 5 أزرار
                while(gameButtonsData.length < 5) {
                    const randomBtn = COLOR_GAME_OPTIONS[Math.floor(Math.random() * COLOR_GAME_OPTIONS.length)];
                    if(!gameButtonsData.find(b => b.id === randomBtn.id)) gameButtonsData.push(randomBtn);
                }
                gameButtonsData = shuffleArray(gameButtonsData);

                const gameRow = new ActionRowBuilder();
                gameButtonsData.forEach(btn => {
                    gameRow.addComponents(
                        new ButtonBuilder().setCustomId(`fish_click_${btn.id}`).setEmoji(btn.emoji).setStyle(ButtonStyle.Secondary)
                    );
                });

                const sequenceEmojis = sequence.map(s => s.emoji).join(' ➡️ ');
                const randomEmbedColor = Math.floor(Math.random() * 0xFFFFFF);
                
                const biteEmbed = new EmbedBuilder()
                    .setTitle("🎣 الـسنـارة تهـتز اسحـب الان !")
                    .setDescription(`**اضغـط الأزرار بالترتيـب:**\n# ${sequenceEmojis}`)
                    .setColor(randomEmbedColor);

                await i.editReply({ embeds: [biteEmbed], components: [gameRow] });

                // 🔥🔥 زيادة الوقت للمستويات (8 ثواني للسهل و 12 ثواني للصعب) 🔥🔥
                const reactionTime = requiredSequenceLength > 1 ? 12000 : 8000;

                const pullFilter = j => j.user.id === user.id && j.customId.startsWith('fish_click_');
                // نطلب عدد ضغطات يساوي طول السلسلة
                const pullCollector = msg.createMessageComponentCollector({ filter: pullFilter, time: reactionTime, max: requiredSequenceLength }); 

                let currentStep = 0;
                let failed = false;

                pullCollector.on('collect', async j => {
                    await j.deferUpdate();
                    
                    if (failed) return; // إذا أخطأ سابقاً لا نتابع

                    const clickedColorId = j.customId.replace('fish_click_', '');
                    const expectedColor = sequence[currentStep];

                    if (clickedColorId !== expectedColor.id) {
                        failed = true;
                        pullCollector.stop('wrong_color');
                        
                        const clickedButtonObj = COLOR_GAME_OPTIONS.find(c => c.id === clickedColorId);
                        const wrongEmoji = clickedButtonObj ? clickedButtonObj.emoji : '❓';
                        
                        const failEmbed = new EmbedBuilder()
                            .setTitle("❌ انقطع الخيط!")
                            .setDescription(`ضغطت ${wrongEmoji} والمطلوب كان ${expectedColor.emoji}\nحاول التركيز أكثر!`)
                            .setColor(Colors.Red);
                        
                        // 🔥 تحديث الكولداون فقط دون التأثير على العمل
                        sql.prepare("UPDATE levels SET lastFish = ? WHERE user = ? AND guild = ?").run(Date.now(), user.id, guild.id);

                        activeFishingSessions.delete(user.id);
                        await j.editReply({ embeds: [failEmbed], components: [] });
                        return;
                    }

                    currentStep++;
                    
                    // إذا أنهى السلسلة بنجاح
                    if (currentStep === requiredSequenceLength) {
                        pullCollector.stop('success');
                        
                        // --- 🎣 بدء منطق الصيد (بعد النجاح في اللعبة) ---
                        
                        // 1. حساب الحظ
                        const totalLuck = (currentRod.luck_bonus || 0) + baitLuckBonus;

                        // 2. التحقق من الوحوش
                        const monsterChanceBase = Math.random();
                        const isOwner = user.id === OWNER_ID;
                        // الطعم يزيد فرصة الوحش قليلاً
                        const monsterChance = isOwner ? 0.50 : (0.10 + (baitLuckBonus / 1000));
                        const monsterTriggered = monsterChanceBase < monsterChance;

                        let possibleMonsters = monstersConfig.filter(m => m.locations.includes(locationId));
                        if (isOwner && possibleMonsters.length === 0) possibleMonsters = monstersConfig; 
                        
                        if (possibleMonsters.length > 0 && monsterTriggered) {
                            const monster = possibleMonsters[Math.floor(Math.random() * possibleMonsters.length)];
                            
                            let playerWeapon = pvpCore.getWeaponData(sql, j.member);
                            if (!playerWeapon || playerWeapon.currentLevel === 0) {
                                playerWeapon = { name: "سكين صيد صدئة", currentDamage: 15, currentLevel: 1 };
                            }

                            if (pvpCore.startPveBattle) {
                                activeFishingSessions.delete(user.id);
                                await pvpCore.startPveBattle(j, client, sql, j.member, monster, playerWeapon);
                                return; 
                            }
                        }

                        // 3. الصيد العادي
                        const fishCount = Math.floor(Math.random() * currentRod.max_fish) + 1;
                        let caughtFish = [];
                        let totalValue = 0;

                        // حدود الندرة للمكان الحالي
                        const allowedRarities = currentLocation.fish_types;
                        const maxRarity = currentRod.max_rarity || 2;

                        for (let k = 0; k < fishCount; k++) {
                            // إعادة السحب (Reroll) بناءً على الحظ
                            // كل 20 حظ = محاولة إضافية لأخذ الأفضل
                            const rerolls = 1 + Math.floor(totalLuck / 20);
                            
                            let bestFish = null;

                            for(let r=0; r<rerolls; r++) {
                                // اختيار ندرة عشوائية مسموحة
                                // نميل للندرة الأعلى قليلاً
                                let rarity = allowedRarities[Math.floor(Math.random() * allowedRarities.length)];
                                
                                // إذا الندرة أعلى من قدرة السنارة، ننزلها للحد الأقصى
                                if (rarity > maxRarity) rarity = maxRarity;

                                const possibleFishList = fishItems.filter(f => f.rarity === rarity);
                                if (possibleFishList.length > 0) {
                                    const candidate = possibleFishList[Math.floor(Math.random() * possibleFishList.length)];
                                    
                                    if (!bestFish) bestFish = candidate;
                                    else {
                                        // مقارنة: نفضل الندرة الأعلى، ثم السعر الأعلى
                                        if (candidate.rarity > bestFish.rarity || (candidate.rarity === bestFish.rarity && candidate.price > bestFish.price)) {
                                            bestFish = candidate;
                                        }
                                    }
                                }
                            }

                            if (bestFish) {
                                caughtFish.push(bestFish);
                                totalValue += bestFish.price;
                                // إضافة للمخزون
                                sql.prepare(`INSERT INTO user_inventory (guildID, userID, itemID, quantity) VALUES (?, ?, ?, ?) ON CONFLICT(guildID, userID, itemID) DO UPDATE SET quantity = quantity + ?`).run(guild.id, user.id, bestFish.id, 1, 1);
                            }
                        }

                        // 🔥🔥🔥 الإصلاح الجذري: استخدام UPDATE بدلاً من REPLACE لمنع مسح كولداون العمل 🔥🔥🔥
                        sql.prepare("UPDATE levels SET mora = mora + ?, lastFish = ? WHERE user = ? AND guild = ?").run(totalValue, Date.now(), user.id, guild.id);

                        // تجهيز التقرير
                        const summary = {};
                        caughtFish.forEach(f => {
                            summary[f.name] = summary[f.name] ? { count: summary[f.name].count + 1, emoji: f.emoji, rarity: f.rarity } : { count: 1, emoji: f.emoji, rarity: f.rarity };
                        });

                        let description = "✶ قمـت بصيـد:\n";
                        for (const [name, info] of Object.entries(summary)) {
                            let rarityStar = "";
                            if (info.rarity >= 5) rarityStar = "🌟"; else if (info.rarity === 4) rarityStar = "✨";
                            description += `✶ ${info.emoji} ${name} ${rarityStar} **x${info.count}**\n`;
                        }
                        description += `\n✶ قيـمـة الصيد: \`${totalValue.toLocaleString()}\` ${EMOJI_MORA}`;

                        const resultEmbed = new EmbedBuilder()
                            .setTitle(`✥ رحـلـة صيـد فـي المحيـط !`) 
                            .setDescription(description)
                            .setColor(Colors.Green)
                            .setThumbnail('https://i.postimg.cc/Wz0g0Zg0/fishing.png')
                            .setFooter({ text: `السنارة: ${currentRod.name} (Lvl ${currentRod.level})` });

                        activeFishingSessions.delete(user.id);
                        await j.editReply({ embeds: [resultEmbed], components: [] });
                    }
                });

                pullCollector.on('end', async (collected, reason) => {
                    try {
                        if (reason !== 'success' && reason !== 'wrong_color') {
                            // انتهى الوقت
                            const failEmbed = new EmbedBuilder()
                                .setTitle("💨 هربت السمكة!")
                                .setDescription("كنت بطيئاً جداً! حاول أن تكون أسرع في المرة القادمة.")
                                .setColor(Colors.Red);
                            
                            // 🔥 تحديث الكولداون فقط
                            sql.prepare("UPDATE levels SET lastFish = ? WHERE user = ? AND guild = ?").run(Date.now(), user.id, guild.id);

                            await i.editReply({ embeds: [failEmbed], components: [] }).catch(() => {});
                        }
                    } finally {
                        // 🛑 تأكد دائماً من الحذف
                        activeFishingSessions.delete(user.id);
                    }
                });

            }, waitTime);
        });

        // 🔥 التعامل مع حالة عدم ضغط زر "رمي السنارة" في البداية
        collector.on('end', async (collected) => {
            if (collected.size === 0) {
                activeFishingSessions.delete(user.id);
                const cancelEmbed = new EmbedBuilder()
                    .setDescription("💤 ألغيت الرحلة لعدم الاستجابة.")
                    .setColor(Colors.Grey);
                if (isSlash) await interactionOrMessage.editReply({ embeds: [cancelEmbed], components: [] }).catch(() => {});
                else await msg.edit({ embeds: [cancelEmbed], components: [] }).catch(() => {});
            }
        });
    }
};
