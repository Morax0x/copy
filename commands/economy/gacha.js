const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder } = require('discord.js');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const EMOJI_MORA = '<:mora:1435647151349698621>';

// 📚 ترتيب وتصنيف جميع الغنائم (Loot Pool)
const LOOT_POOL = {
    Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: []
};

// إضافة الخامات والكتب للمسبح
upgradeMats.weapon_materials.forEach(race => {
    race.materials.forEach(m => LOOT_POOL[m.rarity].push({ ...m, type: 'material', race: race.race }));
});
upgradeMats.skill_books.forEach(cat => {
    cat.books.forEach(b => LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category }));
});

// إضافة المهارات
skillsConfig.forEach(s => {
    const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
    const rarity = isLegendary ? 'Legendary' : 'Epic';
    LOOT_POOL[rarity].push({ ...s, type: 'skill', rarity: rarity });
});

async function ensurePityTable(db) {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity ("userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`);
    } catch(e) {}
}

function performPull(pityData) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random();

    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        if (rand <= 0.006) rarity = 'Legendary'; // 0.6%
        else if (rand <= 0.056) rarity = 'Epic'; // 5%
        else if (rand <= 0.20) rarity = 'Rare'; // 14.4%
        else if (rand <= 0.50) rarity = 'Uncommon'; // 30%
        else rarity = 'Common'; // 50%
    }

    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    const pool = LOOT_POOL[rarity];
    const item = pool[Math.floor(Math.random() * pool.length)];

    return { item, rarity };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gacha')
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

        let userMora = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0 };
        
        try {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
            userMora = lvlRes.rows[0] ? Number(lvlRes.rows[0].mora) : 0;

            let pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]);
            if (pityRes.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId]);
            }
        } catch (e) { return reply({ content: "❌ حدث خطأ في البيانات." }); }

        const buildMainUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('✨ صـنـدوق الـمـعـرفـة الـغـامـضـة')
                .setDescription(`مرحباً بك يا <@${user.id}> في مِحراِب الحظ.\n\n${EMOJI_MORA} **رصيدك:** ${userMora.toLocaleString()}\n\n🎯 **الضمان القادم:**\n> 🟪 ملحمي بعد: \`${10 - pityData.epic_pity}\` سحبة\n> 🟨 أسطوري بعد: \`${90 - pityData.legendary_pity}\` سحبة`)
                .setColor('#5865F2')
                .setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png')
                .setFooter({ text: '1k مورا للسحبة | 10k للعشر سحبات' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('سحبة واحدة').setStyle(ButtonStyle.Primary).setEmoji('📦'),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('10 سحبات').setStyle(ButtonStyle.Success).setEmoji('🌟')
            );
            return { embeds: [embed], components: [row] };
        };

        const msg = await reply(buildMainUI());

        const collector = msg.createMessageComponentCollector({ 
            filter: i => i.user.id === user.id, 
            time: 60000 
        });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            const cost = i.customId === 'gacha_10' ? PULL_PRICE * 10 : PULL_PRICE;

            if (userMora < cost) return i.followUp({ content: "❌ رصيدك لا يكفي!", ephemeral: true });

            // أنيميشن السحب
            const animEmbed = new EmbedBuilder()
                .setTitle('🌠 جاري فك الختم السحري...')
                .setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif')
                .setColor(Colors.Blue);
            await msg.edit({ embeds: [animEmbed], components: [] });

            await new Promise(r => setTimeout(r, 2000));

            userMora -= cost;
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]);

            const pulls = i.customId === 'gacha_10' ? 10 : 1;
            const results = [];
            let maxRarityFound = 0; // لتحديد لون الـ Embed النهائي

            await db.query('BEGIN');
            for (let p = 0; p < pulls; p++) {
                const { item, rarity } = performPull(pityData);
                const rarityMap = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
                if (rarityMap[rarity] > maxRarityFound) maxRarityFound = rarityMap[rarity];

                if (item.type === 'skill') {
                    const hasSkill = await db.query(`SELECT 1 FROM user_skills WHERE "userID" = $1 AND "skillID" = $2`, [user.id, item.id]);
                    if (hasSkill.rows.length > 0) {
                        // تعويض المكرر: 3 كتب من نفس الندرة
                        const compBook = upgradeMats.skill_books[0].books.find(b => b.rarity === rarity) || upgradeMats.skill_books[0].books[0];
                        await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 3) ON CONFLICT DO UPDATE SET "quantity" = user_inventory."quantity" + 3`, [user.id, guildId, compBook.id]);
                        results.push({ ...item, rarity, note: `(مكرر ♻️ ➔ 3x ${compBook.name})` });
                    } else {
                        await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]);
                        results.push({ ...item, rarity, note: `✨ [جديد]` });
                    }
                } else {
                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [user.id, guildId, item.id]);
                    results.push({ ...item, rarity, note: '' });
                }
            }
            await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3`, [pityData.epic_pity, pityData.legendary_pity, user.id]);
            await db.query('COMMIT');

            const embedColors = [Colors.LightGrey, Colors.Green, Colors.Blue, Colors.Purple, Colors.Gold];
            const resultEmbed = new EmbedBuilder()
                .setTitle(maxRarityFound >= 3 ? '🌟 سحبة محظوظة جداً!' : '🎁 نتائج الصندوق')
                .setColor(embedColors[maxRarityFound])
                .setThumbnail(results.length === 1 && results[0].image ? results[0].image : null);

            let desc = "";
            results.forEach(r => {
                const rarityEmoji = upgradeMats.rarity_colors[r.rarity].emoji;
                desc += `${rarityEmoji} **${r.name}** ${r.note}\n`;
            });
            resultEmbed.setDescription(desc);

            await msg.edit({ embeds: [resultEmbed], components: [buildMainUI().components[0]] });
        });
    }
};
