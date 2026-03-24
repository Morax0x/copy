const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

let generateGachaCard;
try {
    ({ generateGachaCard } = require('../../generators/gacha-generator.js'));
} catch (e) {
    generateGachaCard = null;
}

const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const PULL_PRICE = 1000;
const OWNER_ID = "1145327691772481577";

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
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
            LOOT_POOL[b.rarity].push({ ...b, type: 'book', category: cat.category, imgPath: `images/materials/${typeFolder}/${imgName}` });
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

function performPull(pityData, userRace, ownedSkills) {
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

    let pool = LOOT_POOL[rarity] ? [...LOOT_POOL[rarity]] : [...LOOT_POOL['Common']];

    pool = pool.filter(item => !(item.type === 'skill' && ownedSkills.includes(item.id)));
    if (pool.length === 0) pool = [...LOOT_POOL['Common']]; 

    if (userRace && (rarity === 'Epic' || rarity === 'Legendary')) {
        if (Math.random() < 0.75) {
            const racePool = pool.filter(item => item.race === userRace || (item.type === 'book' && item.category === 'race'));
            if (racePool.length > 0) pool = racePool;
        }
    }

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

        if (!db) return reply({ content: "❌" });
        await ensurePityTable(db);

        let userMora = 0;
        let pityData = { epic_pity: 0, legendary_pity: 0 };
        let ownedSkills = [];
        let userRace = null;

        const fetchUserData = async () => {
            const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            userMora = lvlRes?.rows[0] ? Number(lvlRes.rows[0].mora) : 0;
            
            const skillRes = await db.query(`SELECT "skillID" FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT skillid FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            if(skillRes?.rows) ownedSkills = skillRes.rows.map(r => r.skillID || r.skillid);

            const wepRes = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            if(wepRes?.rows[0]) userRace = wepRes.rows[0].raceName || wepRes.rows[0].racename;
        };

        try {
            await fetchUserData();
            const pityRes = await db.query(`SELECT * FROM user_gacha_pity WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(() => db.query(`SELECT * FROM user_gacha_pity WHERE userid = $1 AND guildid = $2`, [user.id, guildId]));
            if (pityRes?.rows[0]) {
                pityData.epic_pity = pityRes.rows[0].epic_pity || 0;
                pityData.legendary_pity = pityRes.rows[0].legendary_pity || 0;
            } else {
                await db.query(`INSERT INTO user_gacha_pity ("userID", "guildID") VALUES ($1, $2)`, [user.id, guildId]).catch(() => db.query(`INSERT INTO user_gacha_pity (userid, guildid) VALUES ($1, $2)`, [user.id, guildId]).catch(()=>{}));
            }
        } catch (e) { return reply({ content: "❌" }); }

        const getPullButtons = (moraBalance) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('gacha_1').setLabel('📦 x1').setStyle(ButtonStyle.Primary).setDisabled(moraBalance < PULL_PRICE),
                new ButtonBuilder().setCustomId('gacha_10').setLabel('🌟 x10').setStyle(ButtonStyle.Success).setDisabled(moraBalance < PULL_PRICE * 10)
            );
        };

        // 🔥 استخدام الصورة الرئيسية من ملفاتك 🔥
        let initialFiles = [];
        let chestImagePath = path.join(process.cwd(), 'images/gacha/main_chest.png');
        const initialEmbed = new EmbedBuilder().setColor(Colors.Purple);
        
        if (fs.existsSync(chestImagePath)) {
            initialFiles.push(new AttachmentBuilder(chestImagePath, { name: 'main_chest.png' }));
            initialEmbed.setImage('attachment://main_chest.png');
        } else {
            initialEmbed.setImage('https://i.postimg.cc/q7d37hdb/gacha-chest.png');
        }

        const initialMsg = await reply({ embeds: [initialEmbed], components: [getPullButtons(userMora)], files: initialFiles });
        
        const channelCollector = (isSlash ? interactionOrMessage.channel : interactionOrMessage.channel).createMessageComponentCollector({
            filter: i => i.user.id === user.id && ['gacha_1', 'gacha_10'].includes(i.customId),
            time: 300000 
        });

        channelCollector.on('collect', async (i) => {
            await i.deferUpdate().catch(()=>{});

            await fetchUserData();
            const isTen = i.customId === 'gacha_10';
            const cost = isTen ? PULL_PRICE * 10 : PULL_PRICE;
            if (userMora < cost) return i.followUp({ content: "❌", flags: [MessageFlags.Ephemeral] });

            await i.editReply({ components: [] }).catch(()=>{});

            // 🔥 عرض صورة النيزك (الساقط) كشاشة تحميل 🔥
            let summonFiles = [];
            const summonEmbed = new EmbedBuilder().setColor(Colors.Blue);
            let summonImagePath = path.join(process.cwd(), 'images/gacha/summon_magic.png');
            
            if (fs.existsSync(summonImagePath)) {
                summonFiles.push(new AttachmentBuilder(summonImagePath, { name: 'summon_magic.png' }));
                summonEmbed.setImage('attachment://summon_magic.png');
            } else {
                summonEmbed.setImage('https://i.postimg.cc/T1b1xJ2R/magic-summon.gif');
            }

            const pullMsg = await i.followUp({ 
                embeds: [summonEmbed],
                files: summonFiles,
                fetchReply: true
            });

            userMora -= cost;
            await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [cost, user.id, guildId]).catch(() => db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [cost, user.id, guildId]).catch(()=>{}));

            const results = [];
            let highestRarityVal = 0;
            const rarityOrder = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Legendary: 4 };
            let bestResult = null;

            await db.query('BEGIN').catch(()=>{});
            for (let k = 0; k < (isTen ? 10 : 1); k++) {
                const { item, rarity } = performPull(pityData, userRace, ownedSkills);
                
                if (rarityOrder[rarity] > highestRarityVal) {
                    highestRarityVal = rarityOrder[rarity];
                    bestResult = { item, rarity };
                }

                if (item.type === 'skill') {
                    ownedSkills.push(item.id);
                    await db.query(`INSERT INTO user_skills ("userID", "guildID", "skillID", "skillLevel") VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]).catch(() => db.query(`INSERT INTO user_skills (userid, guildid, skillid, skilllevel) VALUES ($1, $2, $3, 1)`, [user.id, guildId, item.id]).catch(()=>{}));
                } else {
                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, 1) ON CONFLICT("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + 1`, [user.id, guildId, item.id]).catch(() => db.query(`INSERT INTO user_inventory (userid, guildid, itemid, quantity) VALUES ($1, $2, $3, 1) ON CONFLICT(userid, guildid, itemid) DO UPDATE SET quantity = user_inventory.quantity + 1`, [user.id, guildId, item.id]).catch(()=>{}));
                }
                results.push({ item, rarity });
            }
            await db.query(`UPDATE user_gacha_pity SET "epic_pity" = $1, "legendary_pity" = $2 WHERE "userID" = $3 AND "guildID" = $4`, [pityData.epic_pity, pityData.legendary_pity, user.id, guildId]).catch(()=>{});
            await db.query('COMMIT').catch(()=>{});

            // 🔥 عرض النيزك بناءً على أعلى ندرة 🔥
            let meteorFiles = [];
            const prefix = isTen ? 'ten_' : 'single_';
            const meteorFileName = `${prefix}${bestResult.rarity}.png`;
            const meteorPath = path.join(process.cwd(), `images/gacha/${meteorFileName}`);
            
            if (fs.existsSync(meteorPath)) {
                meteorFiles.push(new AttachmentBuilder(meteorPath, { name: meteorFileName }));
                const meteorEmbed = new EmbedBuilder()
                    .setColor(hexColors[bestResult.rarity] || Colors.Blue)
                    .setImage(`attachment://${meteorFileName}`);
                
                await pullMsg.edit({ embeds: [meteorEmbed], files: meteorFiles }).catch(()=>{});
                await new Promise(r => setTimeout(r, 2000)); // ننتظر ثانيتين بعد ظهور النيزك قبل عرض البطاقة
            } else {
                await new Promise(r => setTimeout(r, 1500)); // انتظار افتراضي
            }

            // دالة عرض أفضل نتيجة (بطاقة العنصر) صامتة
            const buildSilentSummary = async () => {
                let files = [];
                const summaryEmbed = new EmbedBuilder().setColor(highestRarityVal === 4 ? Colors.Gold : (highestRarityVal === 3 ? Colors.Purple : Colors.Blue));
                
                if (generateGachaCard && bestResult && bestResult.item.imgPath) {
                    try {
                        const buffer = await generateGachaCard(bestResult.item, bestResult.rarity);
                        if (buffer) {
                            const attachment = new AttachmentBuilder(buffer, { name: 'gacha_best.png' });
                            files.push(attachment);
                            summaryEmbed.setImage('attachment://gacha_best.png');
                        }
                    } catch(e){}
                }
                return { embeds: [summaryEmbed], components: [getPullButtons(userMora)], files };
            };

            if (isTen) {
                let currentIndex = 0;

                const getPagePayload = async (idx) => {
                    const res = results[idx];
                    let files = [];
                    const pageEmbed = new EmbedBuilder().setColor(hexColors[res.rarity] || Colors.Blue);

                    if (generateGachaCard && res.item.imgPath) {
                        try {
                            const buffer = await generateGachaCard(res.item, res.rarity);
                            if (buffer) {
                                const attachment = new AttachmentBuilder(buffer, { name: `gacha_${idx}.png` });
                                files.push(attachment);
                                pageEmbed.setImage(`attachment://gacha_${idx}.png`);
                            }
                        } catch(e){}
                    }

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('gacha_next').setLabel('➡️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId('gacha_skip').setLabel('⏭️').setStyle(ButtonStyle.Secondary)
                    );
                    return { embeds: [pageEmbed], components: [row], files };
                };

                await pullMsg.edit(await getPagePayload(0)).catch(()=>{});

                const pageCollector = pullMsg.createMessageComponentCollector({
                    filter: btn => btn.user.id === user.id && ['gacha_next', 'gacha_skip'].includes(btn.customId),
                    time: 120000 
                });

                pageCollector.on('collect', async btn => {
                    await btn.deferUpdate().catch(()=>{});
                    if (btn.customId === 'gacha_skip') {
                        pageCollector.stop('skipped');
                    } else if (btn.customId === 'gacha_next') {
                        currentIndex++;
                        if (currentIndex >= 10) pageCollector.stop('finished');
                        else await pullMsg.edit(await getPagePayload(currentIndex)).catch(()=>{});
                    }
                });

                pageCollector.on('end', async () => {
                    await fetchUserData();
                    await pullMsg.edit(await buildSilentSummary()).catch(()=>{});
                });

            } else {
                await fetchUserData();
                await pullMsg.edit(await buildSilentSummary()).catch(()=>{});
            }
        });
    }
};
