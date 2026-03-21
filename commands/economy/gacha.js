const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const EMOJI_MORA = '<:mora:1435647151349698621>';

// 📚 ترتيب وتصنيف جميع الغنائم (Loot Pool) بناءً على الندرة
const LOOT_POOL = {
    Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: []
};

// إضافة الخامات والكتب للمسبح
upgradeMats.weapon_materials.forEach(race => {
    race.materials.forEach(m => LOOT_POOL[m.rarity].push({ ...m, type: 'material' }));
});
upgradeMats.skill_books.forEach(cat => {
    cat.books.forEach(b => LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category }));
});

// إضافة المهارات (المهارات العامة = ملحمي، المهارات العرقية والنادرة = أسطوري)
skillsConfig.forEach(s => {
    const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
    if (isLegendary) {
        LOOT_POOL.Legendary.push({ ...s, type: 'skill', rarity: 'Legendary' });
    } else {
        LOOT_POOL.Epic.push({ ...s, type: 'skill', rarity: 'Epic' });
    }
});

// تأكيد وجود جدول الضمان (Pity Table)
async function ensurePityTable(db) {
    try {
        await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity ("userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`);
    } catch(e) {}
}

// دالة السحب (خوارزمية الحظ)
function performPull(pityData) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random(); // رقم بين 0 و 1

    // نظام الضمان
    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        // نسب السقوط العادية
        if (rand <= 0.006) rarity = 'Legendary'; // 0.6%
        else if (rand <= 0.056) rarity = 'Epic'; // 5%
        else if (rand <= 0.20) rarity = 'Rare'; // 14.4%
        else if (rand <= 0.50) rarity = 'Uncommon'; // 30%
        else rarity = 'Common'; // 50%
    }

    // تصفير العدادات عند الحصول على الندرة
    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    // اختيار غنيمة عشوائية من الندرة المحددة
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

        // جلب أموال اللاعب وبيانات الضمان
        let userMora = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0 };
        
        try {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
            userMora = lvlRes.rows[0] ? Number(lvlRes.rows[0].mora) : 0;

            let pityRes;
            try { pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
            catch(e) { pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]); }
            
            if (pityRes.rows[0]) {
                pityData.epic_pity = Number(pityRes.rows[0].epic_pity || pityRes.rows[0].epic_pity) || 0;
                pityData.legendary_pity = Number(pityRes.rows[0].legendary_pity || pityRes.rows[0].legendary_pity) || 0;
            } else {
                try { await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId]); }
                catch(e) { await db.query(`INSERT INTO user_gacha_pity (userid, guildid) VALUES ($1, $2)`, [user.id, guildId]).catch(()=>{}); }
            }
        } catch (e) {
            console.error(e);
            return reply({ content: "❌ حدث خطأ أثناء قراءة بياناتك." });
        }

        const buildMainUI = () => {
            const embed = new EmbedBuilder()
                .setTitle('✨ صـنـدوق الـمـعـرفـة الـغـامـضـة')
                .setDescription(`هل تريد تجربة حظك يا <@${user.id}>؟\nالصندوق يحتوي على خامات للأسلحة، كتب سحرية، ومهارات أسطورية نادرة جداً!\n\n${EMOJI_MORA} **رصيدك الحالي:** ${userMora.toLocaleString()}`)
                .addFields(
                    { name: '🎯 نظام الضمان (Pity)', value: `> 🟪 سحبة للضمان الملحمي: **${10 - pityData.epic_pity}**\n> 🟨 سحبة للضمان الأسطوري: **${90 - pityData.legendary_pity}**` }
                )
                .setColor(Colors.Purple)
                .setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png') // صورة صندوق سحري
                .setFooter({ text: 'سحبة واحدة بـ 1,000 مورا | 10 سحبات بـ 10,000 مورا' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('فتح 1 (1k مورا)').setStyle(ButtonStyle.Primary).setEmoji('📦').setDisabled(userMora < PULL_PRICE),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('فتح 10 (10k مورا)').setStyle(ButtonStyle.Success).setEmoji('🌟').setDisabled(userMora < PULL_PRICE * 10)
            );
            return { embeds: [embed], components: [row] };
        };

        const msg = await reply(buildMainUI());

        const filter = i => i.user.id === user.id && i.customId.startsWith('gacha_');
        const collector = msg.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();
            const isTenPull = i.customId === 'gacha_10';
            const cost = isTenPull ? PULL_PRICE * 10 : PULL_PRICE;

            if (userMora < cost) {
                return i.followUp({ content: "❌ لا تملك مورا كافية!", ephemeral: true });
            }

            // تعطيل الأزرار مؤقتاً وعمل أنيميشن
            await msg.edit({ components: [], embeds: [new EmbedBuilder().setColor(Colors.Blue).setTitle('🌠 يتم استدعاء قوى السحر...').setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif')] });
            
            await new Promise(resolve => setTimeout(resolve, 1500)); // انتظار ثانية ونصف للتشويق

            // خصم المورا
            userMora -= cost;
            try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]); }
            catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [cost, user.id, guildId]); }

            const pulls = isTenPull ? 10 : 1;
            const results = [];
            let highestRarityValue = 0; // 0=Common -> 4=Legendary

            await db.query('BEGIN');

            for (let p = 0; p < pulls; p++) {
                const { item, rarity } = performPull(pityData);
                let isDuplicateSkill = false;
                let compensation = null;

                const rarityMap = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
                if (rarityMap[rarity] > highestRarityValue) highestRarityValue = rarityMap[rarity];

                if (item.type === 'skill') {
                    // فحص إذا كان يملك المهارة
                    let skillRes;
                    try { skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, item.id]); }
                    catch(e) { skillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, item.id]).catch(()=>({rows:[]})); }
                    
                    if (skillRes.rows.length > 0) {
                        isDuplicateSkill = true;
                        // تعويض المكرر بـ 3 كتب من نفس الندرة + 500 مورا
                        const bookReplacement = upgradeMats.skill_books[0].books.find(b => b.rarity === rarity); // كتاب عام من نفس الندرة
                        compensation = { item: bookReplacement, count: 3, mora: 500 };
                        
                        try { await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 3) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 3`, [user.id, guildId, bookReplacement.id]); }
                        catch(e) { await db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, 3) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + 3`, [user.id, guildId, bookReplacement.id]).catch(()=>{}); }
                        
                        try { await db.query(`UPDATE levels SET "mora" = "mora" + 500 WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]); userMora += 500; }
                        catch(e) { await db.query(`UPDATE levels SET mora = mora + 500 WHERE userid = $1 AND guildid = $2`, [user.id, guildId]); userMora += 500; }
                    } else {
                        // إضافة المهارة الجديدة للفل 1
                        try { await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]); }
                        catch(e) { await db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]).catch(()=>{}); }
                    }
                } else {
                    // إضافة الخامات أو الكتب للإنفنتوري
                    try { await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [user.id, guildId, item.id]); }
                    catch(e) { await db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT (userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + 1`, [user.id, guildId, item.id]).catch(()=>{}); }
                }

                results.push({ item, rarity, isDuplicateSkill, compensation });
            }

            // تحديث الضمان في الداتابيز
            try { await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]); }
            catch(e) { await db.query(`UPDATE user_gacha_pity SET epic_pity = $1, legendary_pity = $2 WHERE userid = $3 AND guildid = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]).catch(()=>{}); }

            await db.query('COMMIT');

            // إعداد رسالة النتائج
            const rarityColors = { Common: Colors.LightGrey, Uncommon: Colors.Green, Rare: Colors.Blue, Epic: Colors.Purple, Legendary: Colors.Gold };
            const highestColorArray = [Colors.LightGrey, Colors.Green, Colors.Blue, Colors.Purple, Colors.Gold];
            
            let resultText = "";
            results.forEach(r => {
                const colorEmoji = upgradeMats.rarity_colors[r.rarity].emoji;
                if (r.item.type === 'skill') {
                    if (r.isDuplicateSkill) {
                        resultText += `> ${colorEmoji} ${r.item.emoji} **${r.item.name}** (مكرر ♻️) ➔ تحول إلى 3x ${r.compensation.item.name} + 500 مورا\n`;
                    } else {
                        resultText += `> ${colorEmoji} ✨ **[مـهـارة جـديـدة!]** ${r.item.emoji} **${r.item.name}**\n`;
                    }
                } else {
                    resultText += `> ${colorEmoji} ${r.item.emoji} ${r.item.name}\n`;
                }
            });

            const resultEmbed = new EmbedBuilder()
                .setTitle(`🎁 غـنـائـم الـصـنـدوق`)
                .setColor(highestColorArray[highestRarityValue])
                .setDescription(resultText)
                .setFooter({ text: `سحباتك القادمة: للبنفسجي (${10 - pityData.epic_pity}) | للذهبي (${90 - pityData.legendary_pity})` });

            await msg.edit({ embeds: [resultEmbed], components: [buildMainUI().components[0]] });
        });

        collector.on('end', () => {
            try { msg.edit({ components: [] }); } catch(e) {}
        });
    }
};
