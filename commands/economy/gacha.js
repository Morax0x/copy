const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, AttachmentBuilder } = require('discord.js');
const path = require('path');

// جلب الإعدادات
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

// 📚 بناء مسبح الغنائم (Loot Pool) من ملف JSON الجديد
const LOOT_POOL = {
    Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: []
};

// إضافة الخامات (Materials)
upgradeMats.weapon_materials.forEach(race => {
    race.materials.forEach(m => {
        // تحديد مسار الصورة بناءً على الهيكلة التي اتفقنا عليها
        const imgName = `${race.race.toLowerCase()}_${m.name_en || m.id.split('_')[2]}`;
        LOOT_POOL[m.rarity].push({ 
            ...m, 
            type: 'material', 
            race: race.race,
            imgPath: `./images/materials/${race.race.toLowerCase()}/${imgName}.png`
        });
    });
});

// إضافة كتب المهارات (Skill Books)
upgradeMats.skill_books.forEach(cat => {
    cat.books.forEach(b => {
        const typePrefix = cat.category === 'General_Skills' ? 'gen' : 'race';
        LOOT_POOL[b.rarity].push({ 
            ...b, 
            type: 'book', 
            category: cat.category,
            imgPath: `./images/skill_books/${typePrefix === 'gen' ? 'general' : 'race'}/${b.id}.png`
        });
    });
});

// إضافة المهارات (Skills)
skillsConfig.forEach(s => {
    const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
    if (isLegendary) {
        LOOT_POOL.Legendary.push({ ...s, type: 'skill', rarity: 'Legendary' });
    } else {
        LOOT_POOL.Epic.push({ ...s, type: 'skill', rarity: 'Epic' });
    }
});

async function ensurePityTable(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity (
        "userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, 
        PRIMARY KEY ("userID", "guildID")
    )`).catch(()=>{});
}

// خوارزمية الحظ (Gacha Logic)
function performPull(pityData) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random();

    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        if (rand <= 0.006) rarity = 'Legendary'; // 0.6%
        else if (rand <= 0.051) rarity = 'Epic';      // 5.1%
        else if (rand <= 0.18) rarity = 'Rare';       // 13%
        else if (rand <= 0.48) rarity = 'Uncommon';   // 30%
        else rarity = 'Common';                       // 51.3%
    }

    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    const pool = LOOT_POOL[rarity];
    const item = pool[Math.floor(Math.random() * pool.length)];

    return { item, rarity };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('صندوق')
        .setDescription('افتح صناديق السحر للحصول على مهارات وكتب وخامات تطوير'),
    
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

        await ensurePityTable(db);

        // جلب بيانات اللاعب
        let userMora = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0 };

        try {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
            userMora = lvlRes.rows[0] ? Number(lvlRes.rows[0].mora) : 0;

            const pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId])
                .catch(() => db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));

            if (pityRes.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId]).catch(()=>{});
            }
        } catch (e) { return reply({ content: "❌ خطأ في الاتصال بقاعدة البيانات." }); }

        const buildUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('✨ صـنـدوق الـمـعـرفـة الـغـامـضـة')
                .setDescription(`استخدم المورا لفتح الصناديق والحصول على جوائز نادرة!\n\n${EMOJI_MORA} **رصيدك:** ${userMora.toLocaleString()}`)
                .addFields(
                    { name: '🎯 نظام الضمان', value: `> 🟪 للضمان الملحمي: **${10 - pityData.epic_pity}**\n> 🟨 للضمان الأسطوري: **${90 - pityData.legendary_pity}**`, inline: true }
                )
                .setColor(Colors.Purple)
                .setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png')
                .setFooter({ text: '1,000 مورا للسحبة | 10,000 مورا للعشر سحبات' });

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
            await i.deferUpdate();

            const isTen = i.customId === 'gacha_10';
            const cost = isTen ? PULL_PRICE * 10 : PULL_PRICE;

            if (userMora < cost) return i.followUp({ content: "❌ مورا غير كافية!", flags: [MessageFlags.Ephemeral] });

            // تأثير التحميل
            await msg.edit({ components: [], embeds: [new EmbedBuilder().setTitle('🌌 جاري استدعاء الغنائم...').setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif').setColor(Colors.Blue)] });
            await new Promise(r => setTimeout(r, 1500));

            // خصم المورا
            userMora -= cost;
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]).catch(()=>{});

            const results = [];
            let highestRarityVal = 0;
            const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

            await db.query('BEGIN');
            for (let k = 0; k < (isTen ? 10 : 1); k++) {
                const { item, rarity } = performPull(pityData);
                if (rarityOrder[rarity] > highestRarityVal) highestRarityVal = rarityOrder[rarity];

                let isNew = true;
                let compensation = null;

                if (item.type === 'skill') {
                    const check = await db.query(`SELECT 1 FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, item.id]);
                    if (check.rows.length > 0) {
                        isNew = false;
                        // تعويض المكرر بـ 3 كتب من نفس الندرة + 500 مورا
                        const bookComp = upgradeMats.skill_books[0].books.find(b => b.rarity === rarity) || upgradeMats.skill_books[0].books[0];
                        compensation = { name: bookComp.name, amount: 3, mora: 500 };
                        await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 3) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 3`, [user.id, guildId, bookComp.id]);
                        await db.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
                    } else {
                        await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]);
                    }
                } else {
                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [user.id, guildId, item.id]);
                }
                results.push({ item, rarity, isNew, compensation });
            }

            await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]).catch(()=>{});
            await db.query('COMMIT');

            // إعداد الرسالة النهائية
            let resultDesc = "";
            results.forEach(res => {
                const emoji = upgradeMats.rarity_colors[res.rarity].emoji;
                if (res.compensation) {
                    resultDesc += `${emoji} | **${res.item.name}** (مكرر ♻️) ➔ تعويض: 3x ${res.compensation.name} + 500 مورا\n`;
                } else {
                    const tag = res.item.type === 'skill' ? ' ✨ [مهارة جديدة!]' : '';
                    resultDesc += `${emoji} | **${res.item.name}**${tag}\n`;
                }
            });

            const finalEmbed = new EmbedBuilder()
                .setTitle(isTen ? '🌟 نتائج السحب (10 سحبات)' : '📦 نتيجة السحب')
                .setDescription(resultDesc)
                .setColor(highestRarityVal >= 3 ? (highestRarityVal === 4 ? Colors.Gold : Colors.Purple) : Colors.Blue)
                .setFooter({ text: `الضمان: الملحمي (${10 - pityData.epic_pity}) | الأسطوري (${90 - pityData.legendary_pity})` });

            await msg.edit({ embeds: [finalEmbed], components: [buildUI().components[0]] });
        });
    }
};
