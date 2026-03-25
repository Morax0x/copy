const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');

let generateInventoryCard, generateMainHub, generateSkillsCard;
try {
    ({ generateInventoryCard, generateMainHub } = require('../generators/inventory-generator.js'));
    ({ generateSkillsCard } = require('../generators/skills-card-generator.js'));
} catch (e) {
    generateInventoryCard = null; generateMainHub = null; generateSkillsCard = null;
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
            // 🔥 المتغير الجديد لتتبع موقع المؤشر في الحقيبة (من 0 إلى 14) 🔥
            let selectedIndex = 0; 

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

                // --- عرض الحقيبة (الخيمة + الأقسام) ---
                if (currentView === 'inventory') {
                    if (invCategory === 'main') {
                        const hubRank = rankInfo.name.split(' ')[1] || rankInfo.name;
                        const buffer = await generateMainHub(targetUser, cleanName, totalMora, hubRank, arabicRaceName, weaponName);
                        
                        const cats = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`c_mat_${authorUser.id}`).setLabel('موارد').setStyle(ButtonStyle.Success).setEmoji('💎'),
                            new ButtonBuilder().setCustomId(`c_fis_${authorUser.id}`).setLabel('صيد').setStyle(ButtonStyle.Success).setEmoji('🎣'),
                            new ButtonBuilder().setCustomId(`c_far_${authorUser.id}`).setLabel('مزرعة').setStyle(ButtonStyle.Success).setEmoji('🌾'),
                            new ButtonBuilder().setCustomId(`c_oth_${authorUser.id}`).setLabel('أخرى').setStyle(ButtonStyle.Success).setEmoji('📦'),
                            new ButtonBuilder().setCustomId(`v_pro_${authorUser.id}`).setLabel('العودة').setStyle(ButtonStyle.Danger)
                        );
                        return { content: `**⛺ خيمة ${cleanName}**`, files: [new AttachmentBuilder(buffer, { name: 'h.png' })], components: [cats] };
                    }

                    // عرض أقسام الحقيبة (موارد، إلخ) مع أزرار التحكم
                    const invQuery = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [targetUser.id, guildId]);
                    const items = invQuery.rows.map(row => {
                        const info = resolveItemInfo(row.itemID || row.itemid);
                        return { ...info, quantity: row.quantity, id: row.itemID || row.itemid };
                    }).filter(i => i.category === invCategory);

                    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
                    const slice = items.slice((invPage-1)*ITEMS_PER_PAGE, invPage*ITEMS_PER_PAGE);

                    // 🔥 تمرير الـ selectedIndex إلى المولد ليرسم المؤشر 🔥
                    const buffer = await generateInventoryCard(cleanName, invCategory, slice, invPage, totalPages, selectedIndex);

                    // 🔥 تصميم الأزرار الـ 4 (D-Pad Navigation) 🔥
                    const row1 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_l2_${authorUser.id}`).setEmoji('⏪').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`d_u1_${authorUser.id}`).setEmoji('⬆️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_r2_${authorUser.id}`).setEmoji('⏩').setStyle(ButtonStyle.Secondary)
                    );
                    const row2 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_l1_${authorUser.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_ok_${authorUser.id}`).setLabel('OK').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`d_r1_${authorUser.id}`).setEmoji('➡️').setStyle(ButtonStyle.Primary)
                    );
                    const row3 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`d_u2_${authorUser.id}`).setEmoji('⏫').setStyle(ButtonStyle.Secondary),
                        new ButtonBuilder().setCustomId(`d_d1_${authorUser.id}`).setEmoji('⬇️').setStyle(ButtonStyle.Primary),
                        new ButtonBuilder().setCustomId(`d_d2_${authorUser.id}`).setEmoji('⏬').setStyle(ButtonStyle.Secondary)
                    );
                    const row4 = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                        new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setLabel('العودة').setStyle(ButtonStyle.Danger),
                        new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(invPage >= totalPages)
                    );

                    return { 
                        content: `**🎒 حقيبة ${cleanName} | ${invCategory}**\n> 🎯 استخدم الأسهم للتحرك واضغط **OK** لتفاصيل العنصر.`, 
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

                // --- التنقل بين الواجهات الرئيسية ---
                if (id.startsWith('v_inv_')) { currentView = 'inventory'; invCategory = 'main'; selectedIndex = 0; }
                else if (id.startsWith('v_com_')) { currentView = 'combat'; skillPage = 0; }
                else if (id.startsWith('v_pro_')) { currentView = 'profile'; }
                else if (id.startsWith('cat_main_')) { invCategory = 'main'; }
                else if (id.startsWith('c_mat_')) { currentView = 'inventory'; invCategory = 'materials'; invPage = 1; selectedIndex = 0; }
                else if (id.startsWith('c_fis_')) { currentView = 'inventory'; invCategory = 'fishing'; invPage = 1; selectedIndex = 0; }
                else if (id.startsWith('c_far_')) { currentView = 'inventory'; invCategory = 'farming'; invPage = 1; selectedIndex = 0; }
                else if (id.startsWith('c_oth_')) { currentView = 'inventory'; invCategory = 'others'; invPage = 1; selectedIndex = 0; }
                
                // --- تقليب الصفحات ---
                else if (id.startsWith('inv_n_')) { invPage++; selectedIndex = 0; }
                else if (id.startsWith('inv_p_')) { invPage--; selectedIndex = 0; }
                else if (id.startsWith('sk_n_')) { skillPage++; }
                else if (id.startsWith('sk_p_')) { skillPage--; }

                // 🔥 منطق أزرار التوجيه (D-Pad) داخل الحقيبة 🔥
                else if (id.startsWith('d_')) {
                    const moveType = id.split('_')[1]; 
                    // الشبكة عبارة عن 3 صفوف و 5 أعمدة (0 إلى 14)
                    
                    if (moveType === 'r1') { // يمين خطوة
                        if (selectedIndex % 5 !== 4) selectedIndex += 1; 
                    } 
                    else if (moveType === 'l1') { // يسار خطوة
                        if (selectedIndex % 5 !== 0) selectedIndex -= 1;
                    }
                    else if (moveType === 'd1') { // تحت خطوة
                        if (selectedIndex + 5 < 15) selectedIndex += 5;
                    }
                    else if (moveType === 'u1') { // فوق خطوة
                        if (selectedIndex - 5 >= 0) selectedIndex -= 5;
                    }
                    else if (moveType === 'r2') { // يمين خطوتين
                        if (selectedIndex % 5 <= 2) selectedIndex += 2;
                        else selectedIndex += (4 - (selectedIndex % 5)); // يوصل للآخر لو مافي خطوتين
                    }
                    else if (moveType === 'l2') { // يسار مضاعف
                        if (selectedIndex % 5 >= 2) selectedIndex -= 2;
                        else selectedIndex -= (selectedIndex % 5); // يوصل للأول
                    }
                    else if (moveType === 'd2') { // تحت مضاعف
                        if (selectedIndex + 10 < 15) selectedIndex += 10;
                        else if (selectedIndex + 5 < 15) selectedIndex += 5;
                    }
                    else if (moveType === 'u2') { // فوق مضاعف
                        if (selectedIndex - 10 >= 0) selectedIndex -= 10;
                        else if (selectedIndex - 5 >= 0) selectedIndex -= 5;
                    }
                    else if (moveType === 'ok') {
                        // هنا سنبرمج "فتح صفحة العنصر" في الخطوة القادمة
                        return i.followUp({ content: `✅ لقد قمت باختيار المربع رقم: **${selectedIndex + 1}**\n(سيتم برمجة فتح صفحة العنصر قريباً!)`, flags: [MessageFlags.Ephemeral] });
                    }
                }

                await msg.edit(await renderView());
            });

        } catch (error) {
            console.error(error);
            return reply({ content: "❌ حدث خطأ أثناء تحميل البيانات." });
        }
    }
};
