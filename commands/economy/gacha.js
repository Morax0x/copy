const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, AttachmentBuilder } = require('discord.js');
const path = require('path');

let generateGachaCard;
try {
    ({ generateGachaCard } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null;
}

const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const EMOJI_MORA = '<:mora:1435647151349698621>';
const OWNER_ID = "1145327691772481577";

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feather.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const LOOT_POOL = { Common: [], Uncommon: [], Rare: [], Epic: [], Legendary: [] };

if (upgradeMats.weapon_materials) {
    upgradeMats.weapon_materials.forEach(race => {
        race.materials.forEach(m => {
            const raceFolder = race.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[m.id] || `${m.id}.png`;
            LOOT_POOL[m.rarity].push({ ...m, type: 'material', race: race.race, imgPath: `images/materials/${raceFolder}/${imgName}` });
        });
    });
}

if (upgradeMats.skill_books) {
    upgradeMats.skill_books.forEach(cat => {
        cat.books.forEach(b => {
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[b.id] || `${b.id}.png`;
            LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category, imgPath: `images/skill_books/${typeFolder}/${imgName}` });
        });
    });
}

if (skillsConfig) {
    skillsConfig.forEach(s => {
        const isLegendary = s.id.startsWith('race_') || s.id === 'skill_gamble' || s.id === 'skill_dispel';
        const rarity = isLegendary ? 'Legendary' : 'Epic';
        LOOT_POOL[rarity].push({ ...s, type: 'skill', rarity: rarity, imgPath: null });
    });
}

async function ensurePityTable(db) {
    await db.query(`CREATE TABLE IF NOT EXISTS user_gacha_pity ("userID" TEXT, "guildID" TEXT, "epic_pity" INTEGER DEFAULT 0, "legendary_pity" INTEGER DEFAULT 0, PRIMARY KEY ("userID", "guildID"))`).catch(()=>{});
}

function performPull(pityData) {
    pityData.epic_pity++;
    pityData.legendary_pity++;

    let rarity = 'Common';
    const rand = Math.random();

    if (pityData.legendary_pity >= 90) rarity = 'Legendary';
    else if (pityData.epic_pity >= 10) rarity = 'Epic';
    else {
        if (rand <= 0.006) rarity = 'Legendary';
        else if (rand <= 0.051) rarity = 'Epic';
        else if (rand <= 0.18) rarity = 'Rare';
        else if (rand <= 0.48) rarity = 'Uncommon';
        else rarity = 'Common';
    }

    if (rarity === 'Legendary') { pityData.legendary_pity = 0; pityData.epic_pity = 0; }
    else if (rarity === 'Epic') pityData.epic_pity = 0;

    const pool = LOOT_POOL[rarity] && LOOT_POOL[rarity].length > 0 ? LOOT_POOL[rarity] : LOOT_POOL['Common'];
    const item = pool[Math.floor(Math.random() * pool.length)];
    return { item, rarity };
}

const hexColors = { Common: '#95a5a6', Uncommon: '#2ecc71', Rare: '#3498db', Epic: '#9b59b6', Legendary: '#f1c40f' };

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

        const fetchUserMora = async () => {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            return lvlRes?.rows[0] ? Number(lvlRes.rows[0].mora) : 0;
        };

        try {
            userMora = await fetchUserMora();
            const pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            if (pityRes?.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId]).catch(() => db.query(`INSERT INTO user_gacha_pity (userid, guildid) VALUES ($1, $2)`, [user.id, guildId]).catch(()=>{}));
            }
        } catch (e) { return reply({ content: "❌ خطأ في قراءة البيانات." }); }

        const getPullButtons = (moraBalance) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('سحب x1').setStyle(ButtonStyle.Primary).setEmoji('📦').setDisabled(moraBalance < PULL_PRICE),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('سحب x10').setStyle(ButtonStyle.Success).setEmoji('🌟').setDisabled(moraBalance < PULL_PRICE * 10)
            );
        };

        const initialEmbed = new EmbedBuilder()
            .setTitle('✨ صـنـدوق الـمـعـرفـة الـغـامـضـة')
            .setDescription(`استخدم المورا لفتح الصناديق واستكشاف كنوز الإمبراطورية!\n\n${EMOJI_MORA} **رصيدك:** ${userMora.toLocaleString()}`)
            .addFields({ name: '🎯 نظام الضمان', value: `> 🟪 ضمان ملحمي: **${10 - pityData.epic_pity}**\n> 🟨 ضمان أسطوري: **${90 - pityData.legendary_pity}**`, inline: true })
            .setColor(Colors.Purple)
            .setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png');

        const initialMsg = await reply({ embeds: [initialEmbed], components: [getPullButtons(userMora)] });
        
        // ربط الـ Collector بالقناة لضمان استقبال تفاعلات السحبات الجديدة بسلاسة
        const channelCollector = (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).createMessageComponentCollector({
            filter: i => i.user.id === user.id && ['gacha_1', 'gacha_10'].includes(i.customId),
            time: 300000 // صالح لمدة 5 دقائق
        });

        channelCollector.on('collect', async (i) => {
            await i.deferUpdate().catch(()=>{});

            userMora = await fetchUserMora();
            const isTen = i.customId === 'gacha_10';
            const cost = isTen ? PULL_PRICE * 10 : PULL_PRICE;
            if (userMora < cost) return i.followUp({ content: "❌ مورا غير كافية!", flags: [MessageFlags.Ephemeral] });

            // 🔥 إخفاء أزرار السحب من الرسالة القديمة (لكي لا يضغطها مرتين) ويظل سجل الصور موجوداً 🔥
            await i.editReply({ components: [] }).catch(()=>{});

            // 🔥 إرسال رسالة جديدة للأنيميشن (لكي ينزل الشات للأسفل ويحتفظ بالقديم) 🔥
            const pullMsg = await i.followUp({ 
                embeds: [new EmbedBuilder().setTitle('🌌 جاري استحضار القوى السحرية...').setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif').setColor(Colors.Blue)],
                fetchReply: true
            });

            await new Promise(r => setTimeout(r, 2000));

            userMora -= cost;
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]).catch(() => db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [cost, user.id, guildId]).catch(()=>{}));

            const results = [];
            let highestRarityVal = 0;
            const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };

            await db.query('BEGIN').catch(()=>{});
            for (let k = 0; k < (isTen ? 10 : 1); k++) {
                const { item, rarity } = performPull(pityData);
                if (rarityOrder[rarity] > highestRarityVal) highestRarityVal = rarityOrder[rarity];

                let compensation = null;
                if (item.type === 'skill') {
                    const check = await db.query(`SELECT 1 FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, item.id]).catch(() => db.query(`SELECT 1 FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, item.id]).catch(()=>({rows:[]})));
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

            const buildSummaryPayload = () => {
                let resultDesc = "";
                results.forEach(res => {
                    const emoji = upgradeMats.rarity_colors[res.rarity]?.emoji || '💠';
                    if (res.compensation) {
                        resultDesc += `${emoji} | **${res.item.name}** (مكرر ♻️) ➔ تعويض 3x كتب + 500 مورا\n`;
                    } else {
                        const tag = res.item.type === 'skill' ? ' ✨ [جديد]' : '';
                        resultDesc += `${emoji} | **${res.item.name}**${tag}\n`;
                    }
                });

                const summaryEmbed = new EmbedBuilder()
                    .setTitle(isTen ? '🌟 النتائج النهائية (10 سحبات)' : '📦 غنيمة الصندوق')
                    .setDescription(resultDesc)
                    .setColor(hexColors[results[0].rarity] || Colors.Blue)
                    .setFooter({ text: `الضمان: الملحمي (${10 - pityData.epic_pity}) | الأسطوري (${90 - pityData.legendary_pity})` });

                if (highestRarityVal >= 3) summaryEmbed.setColor(highestRarityVal === 4 ? Colors.Gold : Colors.Purple);
                return { embeds: [summaryEmbed], components: [getPullButtons(userMora)], files: [] };
            };

            // 🔥 نظام التقليب (Pagination) عند سحب 10 🔥
            if (isTen) {
                let currentIndex = 0;

                const getPagePayload = async (idx) => {
                    const res = results[idx];
                    let files = [];
                    const pageEmbed = new EmbedBuilder()
                        .setTitle(`📦 سحب ${idx + 1} من 10`)
                        .setColor(hexColors[res.rarity] || Colors.Blue)
                        .setFooter({ text: `الضمان: الملحمي (${10 - pityData.epic_pity}) | الأسطوري (${90 - pityData.legendary_pity})` });

                    if (generateGachaCard && res.item.imgPath) {
                        try {
                            const buffer = await generateGachaCard(res.item, res.rarity);
                            if (buffer) {
                                // إعطاء اسم فريد لكل صورة عشان الديسكورد ما يعلق عليها بالكاش
                                const attachment = new AttachmentBuilder(buffer, { name: `gacha_${idx}.png` });
                                files.push(attachment);
                                pageEmbed.setImage(`attachment://gacha_${idx}.png`);
                            }
                        } catch(e){}
                    }

                    let descText = `**${res.item.name}**\n`;
                    if (res.compensation) descText += `*(مكرر ♻️) ➔ تم التعويض بكتب ومورا*`;
                    else if (res.item.type === 'skill') descText += `*✨ [مهارة جديدة!]*`;
                    pageEmbed.setDescription(descText);

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gacha_next').setLabel(idx === 9 ? 'النتائج النهائية 📜' : 'التالي ➡️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('gacha_skip').setLabel('تخطي ⏭️').setStyle(ButtonStyle.Secondary)
                    );

                    return { embeds: [pageEmbed], components: [row], files };
                };

                await pullMsg.edit(await getPagePayload(0)).catch(()=>{});

                const pageCollector = pullMsg.createMessageComponentCollector({
                    filter: btn => btn.user.id === user.id && ['gacha_next', 'gacha_skip'].includes(btn.customId),
                    time: 120000 // دقيقتين للمرور على الصور
                });

                pageCollector.on('collect', async btn => {
                    await btn.deferUpdate().catch(()=>{});
                    if (btn.customId === 'gacha_skip') {
                        pageCollector.stop('skipped');
                    } else if (btn.customId === 'gacha_next') {
                        currentIndex++;
                        if (currentIndex >= 10) {
                            pageCollector.stop('finished');
                        } else {
                            await pullMsg.edit(await getPagePayload(currentIndex)).catch(()=>{});
                        }
                    }
                });

                pageCollector.on('end', async () => {
                    // عند انتهاء التقليب، يتم عرض قائمة النتائج مع أزرار السحب الجديدة
                    userMora = await fetchUserMora();
                    await pullMsg.edit(buildSummaryPayload()).catch(()=>{});
                });

            } else {
                // 🔥 نظام السحب الفردي (1 Pull) 🔥
                const res = results[0];
                let files = [];
                const finalEmbed = buildSummaryPayload().embeds[0];
                
                if (generateGachaCard && res.item.imgPath) {
                    try {
                        const buffer = await generateGachaCard(res.item, res.rarity);
                        if (buffer) {
                            const attachment = new AttachmentBuilder(buffer, { name: 'gacha_single.png' });
                            files.push(attachment);
                            finalEmbed.setImage('attachment://gacha_single.png');
                        }
                    } catch(e){}
                }
                
                await pullMsg.edit({ embeds: [finalEmbed], components: [getPullButtons(userMora)], files }).catch(()=>{});
            }
        });
    }
};
