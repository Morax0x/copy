const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, AttachmentBuilder } = require('discord.js');
const path = require('path');

// جلب المولد والإعدادات (تأكد أن مسار المولد صحيح)
let generateGachaCard;
try {
    ({ generateGachaCard } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null; // تفادي توقف البوت إذا لم تصنع المولد بعد
}

const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

// 📚 بناء مسبح الغنائم (Loot Pool)
const LOOT_POOL = {
    Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: []
};

// إضافة الخامات (الماتيريال)
if (upgradeMats.weapon_materials) {
    upgradeMats.weapon_materials.forEach(race => {
        race.materials.forEach(m => {
            const raceFolder = race.race.toLowerCase().replace(' ', '_');
            LOOT_POOL[m.rarity].push({ 
                ...m, 
                type: 'material', 
                race: race.race,
                // نعتمد على الـ ID كاسم للصورة لتجنب الأخطاء (مثال: mat_dragon_1.png)
                imgPath: m.image || `images/materials/${raceFolder}/${m.id}.png`
            });
        });
    });
}

// إضافة كتب المهارات
if (upgradeMats.skill_books) {
    upgradeMats.skill_books.forEach(cat => {
        cat.books.forEach(b => {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            LOOT_POOL[b.rarity].push({ 
                ...b, 
                type: 'book', 
                category: cat.category,
                imgPath: b.image || `images/skill_books/${typeFolder}/${b.id}.png`
            });
        });
    });
}

// إضافة المهارات
if (skillsConfig) {
    skillsConfig.forEach(s => {
        const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
        const rarity = isLegendary ? 'Legendary' : 'Epic';
        LOOT_POOL[rarity].push({ ...s, type: 'skill', rarity: rarity, imgPath: null }); // المهارات بدون صورة حالياً
    });
}

// 🛡️ إنشاء جدول الضمان إذا لم يكن موجوداً
async function ensurePityTable(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity (
        "userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, 
        PRIMARY KEY ("userID", "guildID")
    )`).catch(()=>{});
}

// 🎲 خوارزمية السحب والضمان
function performPull(pityData) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random();

    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        if (rand <= 0.006) rarity = 'Legendary'; // 0.6%
        else if (rand <= 0.051) rarity = 'Epic'; // 5.1%
        else if (rand <= 0.18) rarity = 'Rare'; // 13%
        else if (rand <= 0.48) rarity = 'Uncommon'; // 30%
        else rarity = 'Common'; // 51.3%
    }

    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    const pool = LOOT_POOL[rarity] && LOOT_POOL[rarity].length > 0 ? LOOT_POOL[rarity] : LOOT_POOL['Common'];
    const item = pool[Math.floor(Math.random() * pool.length)];
    return { item, rarity };
}

module.exports = {
    data: new SlashCommandBuilder().setName('صندوق').setDescription('افتح صناديق السحر للحصول على مهارات وكتب وخامات تطوير'),
    name: 'صندوق',
    aliases: ['gacha', 'صناديق', 'سحب', 'pull'],
    category: 'RPG',

    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;

        if (isSlash) await interactionOrMessage.deferReply();
        const reply = async (payload) => isSlash ? interactionOrMessage.editReply(payload) : interactionOrMessage.reply(payload);

        if (!db) return reply({ content: "❌ قاعدة البيانات غير متصلة." });

        await ensurePityTable(db);

        let userMora = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0 };

        try {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId])
                .catch(() => db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            userMora = lvlRes?.rows[0] ? Number(lvlRes.rows[0].mora) : 0;

            const pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
                .catch(() => db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));

            if (pityRes?.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId])
                    .catch(() => db.query(`INSERT INTO user_gacha_pity (userid, guildid) VALUES ($1, $2)`, [user.id, guildId]).catch(()=>{}));
            }
        } catch (e) { return reply({ content: "❌ خطأ في قراءة البيانات." }); }

        const buildUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('✨ صـنـدوق الـمـعـرفـة الـغـامـضـة')
                .setDescription(`استخدم المورا لفتح الصناديق واستكشاف كنوز الإمبراطورية!\n\n${EMOJI_MORA} **رصيدك:** ${userMora.toLocaleString()}`)
                .addFields({ name: '🎯 نظام الضمان', value: `> 🟪 ضمان ملحمي: **${10 - pityData.epic_pity}**\n> 🟨 ضمان أسطوري: **${90 - pityData.legendary_pity}**`, inline: true })
                .setColor(Colors.Purple)
                .setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('سحب x1').setStyle(ButtonStyle.Primary).setEmoji('📦').setDisabled(userMora < PULL_PRICE),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('سحب x10').setStyle(ButtonStyle.Success).setEmoji('🌟').setDisabled(userMora < PULL_PRICE * 10)
            );
            return { embeds: [embed], components: [row] };
        };

        const msg = await reply(buildUI());
        
        const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === user.id, time: 60000 });

        collector.on('collect', async (i) => {
            if (!i.customId.startsWith('gacha_')) return;
            await i.deferUpdate().catch(()=>{});

            const isTen = i.customId === 'gacha_10';
            const cost = isTen ? PULL_PRICE * 10 : PULL_PRICE;
            if (userMora < cost) return i.followUp({ content: "❌ مورا غير كافية!", flags: [MessageFlags.Ephemeral] });

            // تأثير التحميل السحري 🪄
            await msg.edit({ components: [], embeds: [new EmbedBuilder().setTitle('🌌 جاري استحضار القوى السحرية...').setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif').setColor(Colors.Blue)] });
            await new Promise(r => setTimeout(r, 2000));

            userMora -= cost;
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId])
                .catch(() => db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [cost, user.id, guildId]).catch(()=>{}));

            const results = [];
            const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
            let bestResult = null;

            await db.query('BEGIN').catch(()=>{});
            
            for (let k = 0; k < (isTen ? 10 : 1); k++) {
                const { item, rarity } = performPull(pityData);
                
                if (!bestResult || rarityOrder[rarity] > rarityOrder[bestResult.rarity]) {
                    bestResult = { item, rarity };
                }

                let compensation = null;
                if (item.type === 'skill') {
                    const check = await db.query(`SELECT 1 FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, item.id])
                        .catch(() => db.query(`SELECT 1 FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, item.id]).catch(()=>({rows:[]})));
                    
                    if (check?.rows.length > 0) {
                        const bookComp = upgradeMats.skill_books[0].books.find(b => b.rarity === rarity) || upgradeMats.skill_books[0].books[0];
                        compensation = { name: bookComp.name, amount: 3, mora: 500 };
                        
                        await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 3) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 3`, [user.id, guildId, bookComp.id]).catch(()=>{});
                        await db.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=>{});
                    } else {
                        await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]).catch(()=>{});
                    }
                } else {
                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [user.id, guildId, item.id]).catch(()=>{});
                }
                results.push({ item, rarity, compensation });
            }
            
            await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]).catch(()=>{});
            await db.query('COMMIT').catch(()=>{});

            // 🎨 تجهيز الرد البصري النهائي
            let files = [];
            const finalEmbed = new EmbedBuilder()
                .setTitle(isTen ? '🌟 نتائج السحب الملكي (x10)' : '📦 غنيمة الصندوق')
                .setFooter({ text: `الضمان: الملحمي (${10 - pityData.epic_pity}) | الأسطوري (${90 - pityData.legendary_pity})` });

            // إذا كان المولد جاهزاً ونجح في استدعائه، سنقوم بصناعة الصورة
            if (generateGachaCard && bestResult && bestResult.item.imgPath) {
                try {
                    const imageBuffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                    if (imageBuffer) {
                        const attachment = new AttachmentBuilder(imageBuffer, { name: 'gacha_result.png' });
                        files.push(attachment);
                        finalEmbed.setImage('attachment://gacha_result.png');
                    }
                } catch (err) {
                    console.error("[Gacha Generator Error]:", err);
                }
            }
            
            const hexColors = { Common: '#95a5a6', Uncommon: '#2ecc71', Rare: '#3498db', Epic: '#9b59b6', Legendary: '#f1c40f' };
            finalEmbed.setColor(hexColors[bestResult.rarity] || Colors.Blue);

            let resultDesc = "";
            results.forEach(res => {
                const emoji = upgradeMats.rarity_colors[res.rarity]?.emoji || '💠';
                if (res.compensation) {
                    resultDesc += `${emoji} | **${res.item.name}** (مكرر ♻️) ➔ تعويض 3x كتب + 500 مورا\n`;
                } else {
                    const tag = res.item.type === 'skill' ? ' ✨ [مهارة جديدة!]' : '';
                    resultDesc += `${emoji} | **${res.item.name}**${tag}\n`;
                }
            });
            finalEmbed.setDescription(resultDesc);

            // إعادة الأزرار ليستطيع اللاعب السحب مرة أخرى بدون كتابة الأمر
            await msg.edit({ embeds: [finalEmbed], components: [buildUI().components[0]], files: files }).catch(()=>{});
        });
        
        collector.on('end', () => {
            msg.edit({ components: [] }).catch(()=>{});
        });
    }
};
