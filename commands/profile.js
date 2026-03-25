const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../handlers/streak-handler.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');
const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');
const upgradeMats = require('../json/upgrade-materials.json');
const potionItems = require('../json/potions.json');

// 🔥 استدعاء المولدات الفخمة 🔥
let generateInventoryCard, generateMainHub, generateSkillsCard;
try {
    ({ generateInventoryCard, generateMainHub } = require('../generators/inventory-generator.js'));
    ({ generateSkillsCard } = require('../generators/skills-card-generator.js'));
} catch (e) {
    generateInventoryCard = null; generateMainHub = null; generateSkillsCard = null;
}

let fishData = [], farmItems = [];
try { fishData = require('../json/fish.json'); } catch(e) {}
try { farmItems = require('../json/seeds.json').concat(require('../json/feed-items.json')); } catch(e) {}

// استدعاء دالة حساب الخبرة المركزية
let calculateRequiredXP;
try {
    ({ calculateRequiredXP } = require('../handlers/handler-utils.js'));
} catch (e) {
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

const SKILL_TO_IMAGE = {
    'skill_healing': 'heal.png', 'skill_shielding': 'shield.png', 'skill_buffing': 'buff.png', 'skill_rebound': 'rebound.png',
    'skill_weaken': 'weaken.png', 'skill_dispel': 'dispel.png', 'skill_cleanse': 'cleanse.png', 'skill_poison': 'poison.png',
    'skill_gamble': 'gamble.png', 'race_dragon_skill': 'dragon.png', 'race_human_skill': 'human.png', 'race_seraphim_skill': 'seraphim.png',
    'race_demon_skill': 'demon.png', 'race_elf_skill': 'elf.png', 'race_dark_elf_skill': 'darkelf.png', 'race_vampire_skill': 'vampire.png',
    'race_hybrid_skill': 'hybrid.png', 'race_spirit_skill': 'spirit.png', 'race_dwarf_skill': 'dwarf.png', 'race_ghoul_skill': 'ghoul.png'
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
    const wRes = await db.query(`SELECT "userID", "raceName", "weaponLevel" FROM user_weapons WHERE "guildID" = $1 AND "userID" != $2`, [guildID, TARGET_OWNER_ID]);
    const weapons = wRes.rows;
    const lvlRes = await db.query(`SELECT "user" as "userID", "level" FROM levels WHERE "guild" = $1`, [guildID]);
    const levelsMap = new Map(lvlRes.rows.map(r => [r.userID || r.userid, r.level]));
    const skillRes = await db.query(`SELECT "userID", SUM("skillLevel") as "totalLevels" FROM user_skills WHERE "guildID" = $1 GROUP BY "userID"`, [guildID]);
    const skillsMap = new Map(skillRes.rows.map(r => [r.userID || r.userid, parseInt(r.totalLevels || r.totallevels) || 0]));

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === (w.raceName || w.racename));
        if(!conf) continue;
        const wLvl = w.weaponLevel || w.weaponlevel;
        const dmg = conf.base_damage + (conf.damage_increment * (wLvl - 1));
        const uid = w.userID || w.userid;
        const playerLevel = levelsMap.get(uid) || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillLevelsTotal = skillsMap.get(uid) || 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: uid, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

module.exports = {
    // 🔥 أمر السلاش الشامل بقائمة منسدلة 🔥
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('المركز الرئيسي: يعرض البروفايل، الحقيبة، أو العتاد الخاص بك.')
        .addUserOption(option => 
            option.setName('user')
            .setDescription('المستخدم الذي تريد عرض بياناته (اختياري)')
            .setRequired(false))
        .addStringOption(option => 
            option.setName('tab')
            .setDescription('القسم الذي تود فتحه مباشرة (اختياري)')
            .setRequired(false)
            .addChoices(
                { name: '🪪 بطاقة البروفايل', value: 'profile' },
                { name: '🎒 الحقيبة', value: 'inventory' },
                { name: '⚔️ العتاد والمهارات', value: 'combat' }
            )),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card', 'inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة', 'مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'], 
    description: 'يعرض بطاقة المغامر أو الحقيبة أو العتاد الخاص بك.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser, targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            authorUser = interaction.user; 
            targetMember = interaction.options.getMember('user') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            authorUser = message.author; 
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            else return message.channel.send(payload);
        };

        if (!targetMember || targetMember.user.bot) return reply({ content: "❌ لا يمكن عرض بيانات هذا العضو." });

        try {
            const db = client.sql;
            const targetUser = targetMember.user; 
            const userId = targetUser.id;
            const guildId = guild.id;
            const isOwnProfile = userId === authorUser.id;
            const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

            // =====================================
            // 📊 1. جلب البيانات الأساسية للبروفايل
            // =====================================
            let levelData = null;
            if (client.getLevel) levelData = await client.getLevel(userId, guildId);
            if (!levelData) {
                const lvlRes = await db.query(`SELECT "xp", "level", "mora", "bank" FROM levels WHERE "user" = $1 AND "guild" = $2`, [userId, guildId]);
                levelData = lvlRes.rows[0] || { xp: 0, level: 1, mora: 0, bank: 0 };
            }
            
            const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
            const currentXP = Number(levelData.xp) || 0;
            const requiredXP = calculateRequiredXP(levelData.level);

            const repRes = await db.query(`SELECT "rep_points" FROM user_reputation WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]);
            const repData = repRes.rows[0] || { rep_points: 0 };
            const rankInfo = getRepRankInfo(repData.rep_points || repData.reppoints || 0);

            const userRaceData = await getUserRace(targetMember, db);
            const raceNameRaw = userRaceData ? (userRaceData.raceName || userRaceData.racename) : null;
            const arabicRaceName = raceNameRaw ? (RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw) : "مجهول";
            
            const weaponData = await getWeaponData(db, targetMember);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";
            const weaponDmg = weaponData ? weaponData.currentDamage : 0;
            const maxHp = PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL);

            const streakRes = await db.query(`SELECT * FROM streaks WHERE "guildID" = $1 AND "userID" = $2`, [guildId, userId]);
            const streakData = streakRes.rows[0];
            const streakCount = streakData ? (streakData.streakCount || streakData.streakcount || 0) : 0;
            let hasItemShields = streakData ? (streakData.hasItemShield || streakData.hasitemshield || 0) : 0;
            let hasGraceShield = (streakData && (streakData.hasGracePeriod === 1 || streakData.hasgraceperiod === 1)) ? 1 : 0;
            const totalShields = Number(hasItemShields) + Number(hasGraceShield);

            const xpBuffMultiplier = await calculateBuffMultiplier(targetMember, db);
            const moraBuffMultiplier = await calculateMoraBuff(targetMember, db);
            const xpBuffPercent = Math.floor((xpBuffMultiplier - 1) * 100);
            const moraBuffPercent = Math.floor((moraBuffMultiplier - 1) * 100);

            let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
            if (userId !== TARGET_OWNER_ID) {
                const allScores = await db.query(`SELECT "user" FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY "totalXP" DESC`, [guildId, TARGET_OWNER_ID]);
                let rLvl = allScores.rows.findIndex(s => s.user === userId) + 1;
                ranks.level = rLvl > 0 ? rLvl.toString() : "0";

                const allMora = await db.query(`SELECT "user" FROM levels WHERE "guild" = $1 AND "user" != $2 ORDER BY (CAST(COALESCE("mora", '0') AS BIGINT) + CAST(COALESCE("bank", '0') AS BIGINT)) DESC`, [guildId, TARGET_OWNER_ID]);
                let rMora = allMora.rows.findIndex(s => s.user === userId) + 1;
                ranks.mora = rMora > 0 ? rMora.toString() : "0";

                const allStreaks = await db.query(`SELECT "userID" FROM streaks WHERE "guildID" = $1 AND "userID" != $2 ORDER BY "streakCount" DESC`, [guildId, TARGET_OWNER_ID]);
                let rStreak = allStreaks.rows.findIndex(s => (s.userID || s.userid) === userId) + 1;
                ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

                let rPower = await calculateStrongestRank(db, guildId, userId);
                ranks.power = rPower > 0 ? rPower.toString() : "0";
            }

            let displayMora = totalMora.toLocaleString();
            if (userId === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) displayMora = "???";

            const profileData = {
                user: targetUser, displayName: cleanName, rankInfo: rankInfo, repPoints: repData.rep_points || repData.reppoints || 0,
                level: levelData.level, currentXP: currentXP, requiredXP: requiredXP, mora: displayMora, raceName: arabicRaceName,
                weaponName: weaponName, weaponDmg: weaponDmg, maxHp: maxHp, streakCount: streakCount, xpBuff: xpBuffPercent,
                moraBuff: moraBuffPercent, shields: totalShields, ranks: ranks
            };

            // =====================================
            // 🎒 2. جلب بيانات الحقيبة والمهارات
            // =====================================
            let inventory = [], dbSkills = [];
            const invRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            inventory = invRes?.rows || [];
            
            const skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
            dbSkills = skillRes?.rows || [];

            const categories = { materials: [], fishing: [], farming: [], others: [] };
            for (const row of inventory) {
                const itemId = row.itemID || row.itemid;
                const quantity = Number(row.quantity) || 0;
                if (quantity <= 0) continue;
                const itemInfo = resolveItemInfo(itemId);
                if (categories[itemInfo.category]) categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
                else categories.others.push({ ...itemInfo, quantity, id: itemId });
            }

            let totalSpent = 0;
            let allSkillsList = [];
            let raceSkillId = null;

            if (userRaceData && weaponData) {
                const originalWeaponConfig = weaponsConfig.find(w => w.race === raceNameRaw);
                if (originalWeaponConfig) {
                    for (let i = 0; i < weaponData.currentLevel; i++) totalSpent += originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                }
                const cleanRaceName = raceNameRaw.toLowerCase().trim().replace(/\s+/g, '_');
                raceSkillId = `race_${cleanRaceName}_skill`;
            }

            let hasRaceSkillInDB = false;
            if (dbSkills.length > 0) {
                for (const dbSkill of dbSkills) {
                    const skillID = dbSkill.skillID || dbSkill.skillid;
                    const skillLevel = Number(dbSkill.skillLevel || dbSkill.skilllevel);
                    const skillConfig = skillsConfig.find(s => s.id === skillID);
                    if (skillConfig) {
                        if (skillConfig.name.includes("شق زمكان") && userId !== TARGET_OWNER_ID) continue; 
                        if (skillID.startsWith('race_') && raceSkillId && skillID !== raceSkillId) continue; 
                        if (raceSkillId && skillID === raceSkillId) hasRaceSkillInDB = true;
                        allSkillsList.push({ id: skillID, name: skillConfig.name, level: skillLevel, description: skillConfig.description });
                        for (let i = 0; i < skillLevel; i++) totalSpent += skillConfig.base_price + (skillConfig.price_increment * i);
                    }
                }
            }

            if (userRaceData && raceSkillId && !hasRaceSkillInDB) {
                const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
                if (raceSkillConfig && (!raceSkillConfig.name.includes("شق زمكان") || userId === TARGET_OWNER_ID)) {
                    allSkillsList.push({ id: raceSkillId, name: raceSkillConfig.name, level: 1, description: raceSkillConfig.description + " [غير مطورة]" });
                }
            }
            allSkillsList.sort((a, b) => b.level - a.level);

            // =====================================
            // 🎮 3. توجيه العرض بناءً على الأمر أو السلاش
            // =====================================
            let currentView = 'profile'; 
            let invCategory = 'main';

            if (isSlash) {
                // التحقق مما اختاره اللاعب في السلاش كوماند
                const chosenTab = interactionOrMessage.options.getString('tab');
                if (chosenTab) {
                    currentView = chosenTab;
                    if (chosenTab === 'inventory') invCategory = 'main';
                }
            } else {
                // توجيه الأوامر النصية العادية
                const commandUsed = interactionOrMessage.content.slice(1).trim().split(/ +/)[0].toLowerCase();
                if (['inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة'].includes(commandUsed)) { currentView = 'inventory'; invCategory = 'main'; }
                else if (['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'].includes(commandUsed)) { currentView = 'combat'; }
            }

            let invPage = 1; 
            let skillPage = 0;

            const getNavigationButtons = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`view_profile_${authorUser.id}`).setLabel('البروفايل').setEmoji('🪪').setStyle(currentView === 'profile' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_inventory_${authorUser.id}`).setLabel('الحقيبة').setEmoji('🎒').setStyle(currentView === 'inventory' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_combat_${authorUser.id}`).setLabel('العتاد والمهارات').setEmoji('⚔️').setStyle(currentView === 'combat' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                );
            };

            const getInvCategoryButtons = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`cat_main_${authorUser.id}`).setLabel('الخيمة').setEmoji('⛺').setStyle(invCategory === 'main' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_materials_${authorUser.id}`).setLabel('موارد').setEmoji('💎').setStyle(invCategory === 'materials' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_fishing_${authorUser.id}`).setLabel('صيد').setEmoji('🎣').setStyle(invCategory === 'fishing' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_farming_${authorUser.id}`).setLabel('مزرعة').setEmoji('🌾').setStyle(invCategory === 'farming' ? ButtonStyle.Success : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`cat_others_${authorUser.id}`).setLabel('أخرى').setEmoji('📦').setStyle(invCategory === 'others' ? ButtonStyle.Success : ButtonStyle.Secondary)
                );
            };

            const renderView = async () => {
                let components = [getNavigationButtons()];

                if (currentView === 'profile') {
                    const buffer = await generateAdventurerCard(profileData);
                    const attachment = new AttachmentBuilder(buffer, { name: 'profile.png' });
                    return { content: `**🪪 البطاقة الشخصية لـ ${cleanName}**`, files: [attachment], components };
                } 
                else if (currentView === 'combat') {
                    if (!generateSkillsCard) return { content: "❌ لا يمكن رسم بطاقة المهارات حالياً.", components };
                    const totalSkillPages = Math.max(1, Math.ceil(allSkillsList.length / SKILLS_PER_PAGE));
                    const currentSkillsSlice = allSkillsList.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE);
                    
                    const cardData = {
                        user: targetUser, avatarUrl: targetUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
                        cleanName: cleanName, weaponData: weaponData, raceName: arabicRaceName, skillsList: currentSkillsSlice,
                        totalSpent: totalSpent, userLevel: levelData.level, currentPage: skillPage, totalPages: totalSkillPages
                    };
                    const buffer = await generateSkillsCard(cardData);
                    const attachment = new AttachmentBuilder(buffer, { name: `skills.png` });

                    if (totalSkillPages > 1) {
                        components.push(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`sk_prev_${authorUser.id}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === 0),
                            new ButtonBuilder().setCustomId(`sk_next_${authorUser.id}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === totalSkillPages - 1)
                        ));
                    }
                    return { content: `**⚔️ العتاد والمهارات لـ ${cleanName}**`, files: [attachment], components };
                }
                else if (currentView === 'inventory') {
                    components.push(getInvCategoryButtons());
                    
                    if (invCategory === 'main') {
                        let rankLetter = 'F';
                        if(levelData.level >= 100) rankLetter = 'SSS'; else if(levelData.level >= 80) rankLetter = 'SS'; else if(levelData.level >= 60) rankLetter = 'S'; else if(levelData.level >= 40) rankLetter = 'A'; else if(levelData.level >= 20) rankLetter = 'B'; else if(levelData.level >= 10) rankLetter = 'C'; else if(levelData.level >= 5) rankLetter = 'D';
                        const buffer = await generateMainHub(targetUser, cleanName, totalMora, rankLetter, arabicRaceName, weaponName);
                        const attachment = new AttachmentBuilder(buffer, { name: 'hub.png' });
                        return { content: `**⛺ خيمة ${cleanName}**`, files: [attachment], components };
                    }
                    
                    const items = categories[invCategory] || [];
                    const catTitles = { materials: 'موارد التطوير', fishing: 'الصيد والأسماك', farming: 'المزرعة والزراعة', others: 'متفرقات' };
                    
                    if (items.length === 0) {
                        return { content: `**🎒 ${cleanName} | [ ${catTitles[invCategory]} ]**\n> ❌ هذا القسم فارغ تماماً.`, files: [], components };
                    }

                    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
                    if (invPage > totalPages) invPage = totalPages;
                    const startIdx = (invPage - 1) * ITEMS_PER_PAGE;
                    const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

                    if (totalPages > 1) {
                        components.push(new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`inv_p_${authorUser.id}`).setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(invPage === 1),
                            new ButtonBuilder().setCustomId('disp').setLabel(`${invPage}/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                            new ButtonBuilder().setCustomId(`inv_n_${authorUser.id}`).setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(invPage === totalPages)
                        ));
                    }
                    if (isOwnProfile) {
                        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`trade_init_${authorUser.id}`).setLabel('مبادلة عنصر 🤝').setStyle(ButtonStyle.Success)));
                    }

                    const buffer = await generateInventoryCard(cleanName, catTitles[invCategory], pageItems, invPage, totalPages);
                    const attachment = new AttachmentBuilder(buffer, { name: 'inv.png' });
                    return { content: `**🎒 ${cleanName} | [ ${catTitles[invCategory]} ]**`, files: [attachment], components };
                }
            };

            const msg = await reply(await renderView());
            const filter = i => i.user.id === authorUser.id && i.customId.includes(authorUser.id);
            const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

            collector.on('collect', async (i) => {
                try { await i.deferUpdate(); } catch(e) { return; }
                const id = i.customId;

                if (id.startsWith('view_')) {
                    currentView = id.split('_')[1];
                    await msg.edit(await renderView()).catch(()=>{});
                }
                else if (id.startsWith('cat_')) {
                    invCategory = id.split('_')[1];
                    invPage = 1;
                    await msg.edit(await renderView()).catch(()=>{});
                }
                else if (id.startsWith('inv_n_')) { invPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('inv_p_')) { invPage--; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_next_')) { skillPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_prev_')) { skillPage--; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('trade_init_')) {
                    const tradableItems = categories[invCategory];
                    const options = tradableItems.slice(0, 25).map(item => ({ label: item.name, value: item.id, emoji: item.emoji || '📦', description: `الكمية المتاحة: ${item.quantity}` }));
                    const itemSelect = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade_item_${authorUser.id}`).setPlaceholder('اختر العنصر الذي تريد إرساله...').addOptions(options));
                    await i.editReply({ components: [itemSelect] }).catch(()=>{});
                }
                else if (i.isStringSelectMenu() && id.startsWith('trade_item_')) {
                    global.tradeTempItem = i.values[0];
                    const userSelect = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId(`trade_target_${authorUser.id}`).setPlaceholder('اختر اللاعب الذي تريد التعامل معه...'));
                    await i.editReply({ components: [userSelect] }).catch(()=>{});
                }
                else if (i.isUserSelectMenu() && id.startsWith('trade_target_')) {
                    const targetID = i.values[0];
                    if (targetID === authorUser.id || (await client.users.fetch(targetID)).bot) return i.followUp({ content: '❌ لا يمكنك التبادل مع نفسك أو البوت!', flags: [MessageFlags.Ephemeral] });

                    const modal = new ModalBuilder().setCustomId(`trade_modal_${authorUser.id}_${targetID}`).setTitle('إعدادات المبادلة');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_qty').setLabel('الكمية المراد إرسالها').setStyle(TextInputStyle.Short).setRequired(true)),
                        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('trade_price').setLabel('السعر (مورا) - ضع 0 للهدية').setStyle(TextInputStyle.Short).setValue('0').setRequired(true))
                    );
                    await i.showModal(modal).catch(()=>{});
                }
            });

            collector.on('end', () => { try { msg.edit({ components: [] }).catch(()=>{}); } catch(e) {} });

        } catch (error) {
            console.error("Error in Hub command:", error);
            if (isSlash) await interaction.editReply({ content: "حدث خطأ أثناء تحميل البيانات." });
            else message.reply("حدث خطأ أثناء تحميل البيانات.");
        }
    }
};
