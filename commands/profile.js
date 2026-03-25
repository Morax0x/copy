const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');

let generateInventoryCard, generateMainHub, generateItemDetailsCard, generateSkillsCard;
try {
    ({ generateInventoryCard, generateMainHub, generateItemDetailsCard } = require('../generators/inventory-generator.js'));
    ({ generateSkillsCard } = require('../generators/skills-card-generator.js'));
} catch (e) {
    generateInventoryCard = null; generateMainHub = null; generateItemDetailsCard = null; generateSkillsCard = null;
}

const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');
const upgradeMats = require('../json/upgrade-materials.json');
const potionItems = require('../json/potions.json');

let fishData = [], farmItems = [];
try { fishData = require('../json/fish.json'); } catch(e) {}
try { farmItems = require('../json/seeds.json').concat(require('../json/feed-items.json')); } catch(e) {}

let calculateRequiredXP;
try { ({ calculateRequiredXP } = require('../handlers/handler-utils.js')); } 
catch (e) {
    calculateRequiredXP = function(lvl) {
        if (lvl < 35) return 5 * (lvl ** 2) + (50 * lvl) + 100;
        return 15 * (lvl ** 2) + (150 * lvl);
    };
}

const TARGET_OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';
const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;
const ITEMS_PER_PAGE = 15;
const SKILLS_PER_PAGE = 3;

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

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

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

function resolveItemInfo(itemId) {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => m.id === itemId);
            if (mat) return { name: mat.name, emoji: mat.emoji, category: 'materials', rarity: mat.rarity, imgPath: `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => b.id === itemId);
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            if (book) return { name: book.name, emoji: book.emoji, category: 'materials', rarity: book.rarity, imgPath: `images/materials/${typeFolder}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (fishData && fishData.length > 0) {
        const fish = fishData.find(f => f.id === itemId || f.name === itemId);
        if (fish) return { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing', rarity: fish.rarity > 3 ? 'Epic' : 'Common', imgPath: null };
    }
    if (farmItems && farmItems.length > 0) {
        const farmObj = farmItems.find(f => f.id === itemId || f.name === itemId);
        if (farmObj) return { name: farmObj.name, emoji: farmObj.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: null };
    }
    return { name: itemId, emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}

async function calculateStrongestRank(db, guildID, targetUserID) {
    if (targetUserID === TARGET_OWNER_ID) return 0;
    
    let wRes = await db.query(`SELECT "userID", "raceName", "weaponLevel" FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guildID, TARGET_OWNER_ID]).catch(()=> db.query(`SELECT userid as "userID", racename as "raceName", weaponlevel as "weaponLevel" FROM user_weapons WHERE guildid = $1 AND userid != $2`, [guildID, TARGET_OWNER_ID]).catch(()=>({rows:[]})));
    const weapons = wRes.rows;

    let lvlRes = await db.query(`SELECT "user" as "userID", "level" FROM levels WHERE "guild" = $1`, [guildID]).catch(()=> db.query(`SELECT userid as "userID", level FROM levels WHERE guildid = $1`, [guildID]).catch(()=>({rows:[]})));
    const levelsMap = new Map(lvlRes.rows.map(r => [r.userID, r.level]));

    let skillRes = await db.query(`SELECT "userID", SUM("skillLevel") as "totalLevels" FROM user_skills WHERE "guildID" = $1 GROUP BY "userID"`, [guildID]).catch(()=> db.query(`SELECT userid as "userID", SUM(skilllevel) as "totalLevels" FROM user_skills WHERE guildid = $1 GROUP BY userid`, [guildID]).catch(()=>({rows:[]})));
    const skillsMap = new Map(skillRes.rows.map(r => [r.userID, parseInt(r.totalLevels) || 0]));

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
        if(!conf) continue;
        const wLvl = w.weaponLevel || w.weaponlevel;
        const dmg = conf.base_damage + (conf.damage_increment * (wLvl - 1));
        const playerLevel = levelsMap.get(w.userID) || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillLevelsTotal = skillsMap.get(w.userID) || 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('المركز الرئيسي لبياناتك.')
        .addUserOption(option => option.setName('user').setDescription('عرض بيانات مستخدم آخر').setRequired(false)),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card', 'inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة', 'مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'], 

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser, targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage; guild = interaction.guild; client = interaction.client;
            authorUser = interaction.user; targetMember = interaction.options.getMember('user') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage; guild = message.guild; client = message.client;
            authorUser = message.author; targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            else return message.channel.send(payload);
        };

        if (!targetMember || targetMember.user.bot) return reply({ content: "❌ لا يمكن عرض بيانات هذا العضو." });

        try {
            const db = client.sql; 
            const targetUser = targetMember.user; 
            const guildId = guild.id;
            const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

            let currentView = 'profile'; 
            let invCategory = 'main';
            let invPage = 1; 
            let skillPage = 0;
            let selectedIndex = 0; 
            let activeItemDetails = null; 

            const commandTrigger = !isSlash ? interactionOrMessage.content.slice(1).trim().split(/ +/)[0].toLowerCase() : "";
            if (['inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة'].includes(commandTrigger)) {
                currentView = 'inventory'; invCategory = 'main';
            } else if (['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'].includes(commandTrigger)) {
                currentView = 'combat';
            }

            const renderView = async () => {
                let levelData = db.prepare ? db.prepare("SELECT * FROM levels WHERE user = ? AND guild = ?").get(targetUser.id, guildId) : null;
                if (!levelData) {
                    const res = await db.query(`SELECT * FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guildId]);
                    levelData = res.rows[0] || { xp: 0, level: 1, mora: 0, bank: 0 };
                }

                const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
                const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId]);
                const repPoints = repRes.rows[0]?.rep_points || 0;
                const rankInfo = getRepRankInfo(repPoints);

                const userRaceData = await getUserRace(targetMember, db);
                const raceNameRaw = userRaceData?.raceName || null;
                const arabicRaceName = RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw || "بشري";
                const weaponData = await getWeaponData(db, targetMember);
                const weaponName = weaponData ? weaponData.name : "بدون سلاح";

                // --- عرض البروفايل ---
                if (currentView === 'profile') {
                    const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildId, targetUser.id]);
                    const streakData = streakRes.rows[0] || {};
                    const xpBuff = await calculateBuffMultiplier(targetMember, db);
                    const moraBuff = await calculateMoraBuff(targetMember, db);
                    const ranks = { level: "0", mora: "0", streak: "0", power: "0" };
                    if (targetUser.id !== TARGET_OWNER_ID) {
                        ranks.power = (await calculateStrongestRank(db, guildId, targetUser.id)).toString();
                    }

                    const profData = {
                        user: targetUser, displayName: cleanName, rankInfo, repPoints,
                        level: levelData.level, currentXP: Number(levelData.xp), requiredXP: calculateRequiredXP(levelData.level),
                        mora: (targetUser.id === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) ? "???" : totalMora.toLocaleString(),
                        raceName: arabicRaceName, weaponName, weaponDmg: weaponData?.currentDamage || 0,
                        maxHp: PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL), streakCount: streakData.streakCount || 0,
                        xpBuff: Math.floor((xpBuff - 1) * 100), moraBuff: Math.floor((moraBuff - 1) * 100),
                        shields: Number(streakData.hasItemShield || 0) + (streakData.hasGracePeriod === 1 ? 1 : 0), ranks
                    };

                    const buffer = await generateAdventurerCard(profData);
                    const nav = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`v_inv_${authorUser.id}`).setLabel('حـقـيـبـة').setStyle(ButtonStyle.Primary).setEmoji('🎒'),
                        new ButtonBuilder().setCustomId(`v_com_${authorUser.id}`).setLabel('عـتـاد').setStyle(ButtonStyle.Primary).setEmoji('⚔️')
                    );
                    return { content: `**🪪 بطاقة المغامر | ${cleanName}**`, files: [new AttachmentBuilder(buffer, { name: 'p.png' })], components: [nav] };
                }

                // --- عرض العتاد (المهارات) ---
                if (currentView === 'combat') {
                    const skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, [targetUser.id, guildId]);
                    let allSkills = skillRes.rows.map(s => {
                        const conf = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
                        return conf ? { id: conf.id, name: conf.name, level: s.skillLevel, description: conf.description } : null;
                    }).filter(s => s !== null);
                    allSkills.sort((a,b) => b.level - a.level);

                    const totalSkillPages = Math.max(1, Math.ceil(allSkills.length / SKILLS_PER_PAGE));
                    const slice = allSkills.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE);

                    const cardData = {
                        user: targetUser, avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
                        cleanName, weaponData, raceName: arabicRaceName, skillsList: slice,
                        totalSpent: 0, userLevel: levelData.level, currentPage: skillPage, totalPages: totalSkillPages
                    };
                    const buffer = await generateSkillsCard(cardData);
                    
                    const nav = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`sk_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === 0),
                        new ButtonBuilder().setCustomId(`sk_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage >= totalSkillPages - 1),
                        new ButtonBuilder().setCustomId(`v_pro_${authorUser.id}`).setLabel('العـودة').setStyle(ButtonStyle.Danger)
                    );
                    return { content: `**⚔️ العتاد والمهارات | ${cleanName}**`, files: [new AttachmentBuilder(buffer, { name: 's.png' })], components: [nav] };
                }

                // --- عرض الحقيبة (الخيمة + الأقسام + تفاصيل العنصر) ---
                if (currentView === 'inventory') {
                    if (invCategory === 'main') {
                        const hubRank = rankInfo.name.split(' ')[1] || rankInfo.name;
                        const buffer = await generateMainHub(targetUser, cleanName, totalMora, hubRank, arabicRaceName, weaponName);
                        
                        const cats = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`c_mat_${authorUser.id}`).setLabel('موارد').setStyle(ButtonStyle.Success).setEmoji('💎'),
                            new ButtonBuilder().setCustomId(`c_fis_${authorUser.id}`).setLabel('صيد').setStyle(ButtonStyle.Success).setEmoji('🎣'),
                            new ButtonBuilder().setCustomId(`c_far_${authorUser.id}`).setLabel('مزرعة').setStyle(ButtonStyle.Success).setEmoji('🌾'),
                            new ButtonBuilder().setCustomId(`c_oth_${authorUser.id}`).setLabel('أخرى').setStyle(ButtonStyle.Success).setEmoji('📦'),
                            new ButtonBuilder().setCustomId(`v_pro_${authorUser.id}`).setLabel('العـودة').setStyle(ButtonStyle.Danger)
                        );
                        return { content: `**⛺ خيمة ${cleanName}**`, files: [new AttachmentBuilder(buffer, { name: 'h.png' })], components: [cats] };
                    }

                    // 🔥 إذا كان اللاعب قد اختار عرض تفاصيل عنصر محدد (Item Details View) 🔥
                    if (activeItemDetails) {
                        if (!generateItemDetailsCard) return { content: "❌ لا يمكن رسم صفحة العنصر حالياً.", components: [] };
                        
                        const buffer = await generateItemDetailsCard(cleanName, activeItemDetails);
                        const btnRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`d_back_${authorUser.id}`).setLabel('العـودة').setStyle(ButtonStyle.Danger).setEmoji('↩️')
                        );
                        
                        if (targetUser.id === authorUser.id) {
                            btnRow.addComponents(new ButtonBuilder().setCustomId(`trade_init_${authorUser.id}`).setLabel('إعـطـاء').setStyle(ButtonStyle.Primary).setEmoji('🎁'));
                        }

                        return {
                            content: `**🔍 تفاصيل العنصر | ${activeItemDetails.name}**`,
                            files: [new AttachmentBuilder(buffer, { name: 'item.png' })],
                            components: [btnRow]
                        };
                    }

                    const invQuery = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId]);
                    const items = invQuery.rows.map(row => {
                        const info = resolveItemInfo(row.itemID || row.itemid);
                        return { ...info, quantity: row.quantity, id: row.itemID || row.itemid };
                    }).filter(i => i.category === invCategory);

                    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                    const slice = items.slice((invPage-1)*ITEMS_PER_PAGE, invPage*ITEMS_PER_PAGE);

                    const buffer = await generateInventoryCard(cleanName, invCategory, slice, invPage, totalPages, selectedIndex);

                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_l2_${authorUser.id}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`d_u1_${authorUser.id}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_r2_${authorUser.id}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_l1_${authorUser.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_ok_${authorUser.id}`).setEmoji('💠').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`d_r1_${authorUser.id}`).setEmoji('➡️').setStyle(ButtonStyle.Primary)
                    );
                    const row3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_u2_${authorUser.id}`).setEmoji('⏫').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`d_d1_${authorUser.id}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_d2_${authorUser.id}`).setEmoji('⏬').setStyle(ButtonStyle.Secondary)
                    );
                    const row4 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                        new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setEmoji('↩️').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(invPage >= totalPages)
                    );

                    return { 
                        content: `**🎒 حقيبة ${cleanName} | ${invCategory}**\n> 🎯 استخدم الأسهم للتحرك واضغط **💠** لتفاصيل العنصر.`, 
                        files: [new AttachmentBuilder(buffer, { name: 'i.png' })], 
                        components: [row1, row2, row3, row4] 
                    };
                }
            };

            const msg = await reply(await renderView());
            const collector = msg.createMessageComponentCollector({ filter: i => i.user.id === authorUser.id, time: 300000 });

            collector.on('collect', async (i) => {
                await i.deferUpdate();
                const id = i.customId;

                if (id.startsWith('v_inv_')) { currentView = 'inventory'; invCategory = 'main'; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('v_com_')) { currentView = 'combat'; skillPage = 0; activeItemDetails = null; }
                else if (id.startsWith('v_pro_')) { currentView = 'profile'; activeItemDetails = null; }
                else if (id.startsWith('cat_main_')) { invCategory = 'main'; activeItemDetails = null; }
                else if (id.startsWith('c_mat_')) { currentView = 'inventory'; invCategory = 'materials'; invPage = 1; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('c_fis_')) { currentView = 'inventory'; invCategory = 'fishing'; invPage = 1; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('c_far_')) { currentView = 'inventory'; invCategory = 'farming'; invPage = 1; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('c_oth_')) { currentView = 'inventory'; invCategory = 'others'; invPage = 1; selectedIndex = 0; activeItemDetails = null; }
                
                else if (id.startsWith('inv_n_')) { invPage++; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('inv_p_')) { invPage--; selectedIndex = 0; activeItemDetails = null; }
                else if (id.startsWith('sk_n_')) { skillPage++; }
                else if (id.startsWith('sk_p_')) { skillPage--; }

                // العودة من صفحة تفاصيل العنصر إلى الشبكة
                else if (id.startsWith('d_back_')) { activeItemDetails = null; }

                else if (id.startsWith('d_')) {
                    const moveType = id.split('_')[1]; 
                    
                    if (moveType === 'r1') { if (selectedIndex % 5 !== 4) selectedIndex += 1; } 
                    else if (moveType === 'l1') { if (selectedIndex % 5 !== 0) selectedIndex -= 1; }
                    else if (moveType === 'd1') { if (selectedIndex + 5 < 15) selectedIndex += 5; }
                    else if (moveType === 'u1') { if (selectedIndex - 5 >= 0) selectedIndex -= 5; }
                    else if (moveType === 'r2') { 
                        if (selectedIndex % 5 <= 2) selectedIndex += 2;
                        else selectedIndex += (4 - (selectedIndex % 5)); 
                    }
                    else if (moveType === 'l2') { 
                        if (selectedIndex % 5 >= 2) selectedIndex -= 2;
                        else selectedIndex -= (selectedIndex % 5); 
                    }
                    else if (moveType === 'd2') { 
                        if (selectedIndex + 10 < 15) selectedIndex += 10;
                        else if (selectedIndex + 5 < 15) selectedIndex += 5;
                    }
                    else if (moveType === 'u2') { 
                        if (selectedIndex - 10 >= 0) selectedIndex -= 10;
                        else if (selectedIndex - 5 >= 0) selectedIndex -= 5;
                    }
                    else if (moveType === 'ok') {
                        // 🔥 تحديد العنصر النشط عند الضغط على OK 🔥
                        const invQuery = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId]);
                        const items = invQuery.rows.map(row => {
                            const info = resolveItemInfo(row.itemID || row.itemid);
                            return { ...info, quantity: row.quantity, id: row.itemID || row.itemid };
                        }).filter(it => it.category === invCategory);

                        const slice = items.slice((invPage-1)*ITEMS_PER_PAGE, invPage*ITEMS_PER_PAGE);
                        
                        if (slice[selectedIndex]) {
                            activeItemDetails = slice[selectedIndex];
                        } else {
                            return i.followUp({ content: `❌ هذا المربع فارغ يا عزيزي.`, flags: [MessageFlags.Ephemeral] });
                        }
                    }
                }
                
                // --- نظام الإعطاء المتكامل ---
                else if (id.startsWith('trade_init_')) {
                    if (!activeItemDetails) return;
                    
                    const userSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`trade_target_${authorUser.id}`).setPlaceholder('اختر اللاعب الذي تود التبادل معه...'));
                    await i.followUp({ components: [userSelect], flags: [MessageFlags.Ephemeral] });
                    return; // نوقف التنفيذ هنا عشان ما يحدث الواجهة الأصلية
                }
                else if (i.isUserSelectMenu() && id.startsWith('trade_target_')) {
                    const targetID = i.values[0];
                    if (targetID === authorUser.id || (await client.users.fetch(targetID)).bot) return i.followUp({ content: '❌ لا يمكنك التبادل مع نفسك أو مع البوتات!', flags: [MessageFlags.Ephemeral] });

                    const modal = new ModalBuilder().setCustomId(`trade_modal_${authorUser.id}_${targetID}`).setTitle('إعـطـاء / مـبـادلـة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 للهدية المجانية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                    );
                    await i.showModal(modal).catch(()=>{});

                    try {
                        const modalSubmit = await i.awaitModalSubmit({ filter: m => m.user.id === authorUser.id && m.customId === `trade_modal_${authorUser.id}_${targetID}`, time: 60000 });
                        const qty = parseInt(modalSubmit.fields.getTextInputValue('trade_qty'));
                        const price = parseInt(modalSubmit.fields.getTextInputValue('trade_price'));

                        if (isNaN(qty) || qty <= 0) return modalSubmit.reply({ content: '❌ كمية غير صالحة.', flags: [MessageFlags.Ephemeral] });
                        if (isNaN(price) || price < 0) return modalSubmit.reply({ content: '❌ سعر غير صالح.', flags: [MessageFlags.Ephemeral] });

                        let checkInvRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [authorUser.id, guildId, activeItemDetails.id]).catch(()=>({rows:[]}));
                        const senderInvData = checkInvRes.rows[0];

                        if (!senderInvData || Number(senderInvData.quantity) < qty) return modalSubmit.reply({ content: '❌ أنت لا تملك هذه الكمية في حقيبتك!', flags: [MessageFlags.Ephemeral] });

                        if (price === 0) {
                            await db.query('BEGIN').catch(()=>{});
                            const newSenderQty = Number(senderInvData.quantity) - qty;
                            if (newSenderQty > 0) {
                                await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newSenderQty, senderInvData.id]);
                            } else {
                                await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvData.id]);
                            }

                            await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [targetID, guildId, activeItemDetails.id, qty]);
                            await db.query('COMMIT').catch(()=>{});

                            await modalSubmit.reply({ content: `🎁 <@${authorUser.id}> أرسل **${qty}x ${activeItemDetails.emoji} ${activeItemDetails.name}** كهدية إلى <@${targetID}>!` });
                            
                            activeItemDetails.quantity -= qty;
                            if(activeItemDetails.quantity <= 0) activeItemDetails = null; // إغلاق الصفحة إذا نفدت الكمية
                            await msg.edit(await renderView());
                        } else {
                            await modalSubmit.deferReply();
                            const tradeId = Date.now().toString();
                            const tradeButtons = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId(`trade_acc_${tradeId}`).setLabel('قبول وشراء ✅').setStyle(ButtonStyle.Success),
                                new ButtonBuilder().setCustomId(`trade_dec_${tradeId}`).setLabel('رفض ❌').setStyle(ButtonStyle.Danger)
                            );

                            const tradeMsgObj = await modalSubmit.followUp({ content: `⚖️ **عـقـد تـجـاري**\nمرحباً <@${targetID}>!\nيعرض عليك <@${authorUser.id}>:\n**استلام:** ${qty}x ${activeItemDetails.emoji} ${activeItemDetails.name}\n**دفع:** ${price.toLocaleString()} ${EMOJI_MORA}`, components: [tradeButtons] });

                            const tradeFilter = btn => btn.user.id === targetID && btn.customId.includes(tradeId);
                            const tradeCollector = tradeMsgObj.createMessageComponentCollector({ filter: tradeFilter, time: 60000 });

                            tradeCollector.on('collect', async btn => {
                                await btn.deferUpdate();
                                if (btn.customId.includes('dec_')) {
                                    tradeCollector.stop('declined');
                                    return tradeMsgObj.edit({ content: `❌ تم رفض الصفقة من قبل <@${targetID}>.`, components: [] });
                                }

                                let targetLvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetID, guildId]).catch(()=>({rows:[]}));
                                const targetMora = targetLvlRes.rows[0] ? Number(targetLvlRes.rows[0].mora) : 0;
                                
                                if (targetMora < price) return btn.followUp({ content: '❌ لا تملك المورا الكافية!', flags: [MessageFlags.Ephemeral] });

                                let checkInvFinalRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [authorUser.id, guildId, activeItemDetails.id]).catch(()=>({rows:[]}));
                                const senderInvFinal = checkInvFinalRes.rows[0];

                                if (!senderInvFinal || Number(senderInvFinal.quantity) < qty) {
                                    tradeCollector.stop('failed');
                                    return tradeMsgObj.edit({ content: `❌ فشلت الصفقة: البائع لا يملك الكمية المطلوبة حالياً!`, components: [] });
                                }

                                try {
                                    await db.query('BEGIN').catch(()=>{});
                                    const finalSenderQty = Number(senderInvFinal.quantity) - qty;
                                    if (finalSenderQty > 0) {
                                        await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [finalSenderQty, senderInvFinal.id]);
                                    } else {
                                        await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [senderInvFinal.id]);
                                    }
                                    
                                    await db.query(`INSERT INTO user_inventory ("userID", "guildID", "itemID", "quantity") VALUES ($1, $2, $3, $4) ON CONFLICT ("userID", "guildID", "itemID") DO UPDATE SET "quantity" = user_inventory."quantity" + $4`, [targetID, guildId, activeItemDetails.id, qty]);
                                    await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [price, targetID, guildId]);
                                    await db.query(`UPDATE levels SET "mora" = "mora" + $1 WHERE "user" = $2 AND "guild" = $3`, [price, authorUser.id, guildId]);
                                    await db.query('COMMIT').catch(()=>{});

                                    tradeCollector.stop('accepted');
                                    await tradeMsgObj.edit({ content: `✅ **تمت الصفقة بنجاح!**\nاشترى <@${targetID}> ${qty}x ${activeItemDetails.name} مقابل ${price.toLocaleString()} ${EMOJI_MORA} من <@${authorUser.id}>.`, components: [] });

                                    activeItemDetails.quantity -= qty;
                                    if(activeItemDetails.quantity <= 0) activeItemDetails = null;
                                    await msg.edit(await renderView());
                                } catch (e) {
                                    await db.query('ROLLBACK').catch(()=>{});
                                    tradeCollector.stop('error');
                                    await tradeMsgObj.edit({ content: `❌ حدث خطأ فني أثناء الصفقة.`, components: [] });
                                }
                            });

                            tradeCollector.on('end', (collected, reason) => {
                                if (reason === 'time') tradeMsgObj.edit({ content: `⏳ انتهى وقت العرض.`, components: [] }).catch(()=>{});
                            });
                        }
                    } catch(e) {}
                    return; // إيقاف تنفيذ التحديث الأساسي لأن المعاملة تمت
                }

                // تنفيذ تحديث الواجهة الطبيعي بعد أي حركة أو زر
                await msg.edit(await renderView());
            });

        } catch (error) {
            console.error(error);
            return reply({ content: "❌ حدث خطأ أثناء تحميل البيانات." });
        }
    }
};
