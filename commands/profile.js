// commands/economy/profile.js

const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../streak-handler.js");
const { getUserRace, getWeaponData } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');
const weaponsConfig = require('../json/weapons-config.json');

// 🔒 الآيدي الشخصي اللي طلبت حمايته
const TARGET_OWNER_ID = "1145327691772481577";

const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

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

function calculateStrongestRank(sql, guildID, targetUserID) {
    if (targetUserID === TARGET_OWNER_ID) return 0;
    const weapons = sql.prepare("SELECT userID, raceName, weaponLevel FROM user_weapons WHERE guildID = ? AND userID != ?").all(guildID, TARGET_OWNER_ID);
    const getLvl = sql.prepare("SELECT level FROM levels WHERE guild = ? AND user = ?");
    const getSkills = sql.prepare("SELECT SUM(skillLevel) as totalLevels FROM user_skills WHERE guildID = ? AND userID = ?");

    let stats = [];
    for (const w of weapons) {
        const conf = weaponsConfig.find(c => c.race === w.raceName);
        if(!conf) continue;
        const dmg = conf.base_damage + (conf.damage_increment * (w.weaponLevel - 1));
        const lvlData = getLvl.get(guildID, w.userID);
        const playerLevel = lvlData?.level || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillData = getSkills.get(guildID, w.userID);
        const skillLevelsTotal = skillData ? (skillData.totalLevels || 0) : 0;
        const powerScore = Math.floor(dmg + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('يعرض بطاقة المغامر الشاملة الخاصة بك.')
        .addUserOption(option =>
            option.setName('المستخدم')
            .setDescription('المستخدم الذي تريد عرض بروفايله')
            .setRequired(false)),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card'], 
    description: 'يعرض بطاقة المغامر الشاملة الخاصة بك أو بعضو آخر.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser;
        let targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            authorUser = interaction.user; 
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
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

        try {
            const sql = client.sql;
            const targetUser = targetMember.user; 
            const userId = targetUser.id;
            const guildId = guild.id;

            let levelData = client.getLevel ? client.getLevel.get(userId, guildId) : null;
            if (!levelData) levelData = sql.prepare("SELECT xp, level, mora, bank FROM levels WHERE user = ? AND guild = ?").get(userId, guildId) || { xp: 0, level: 1, mora: 0, bank: 0 };
            
            const totalMora = (levelData.mora || 0) + (levelData.bank || 0);
            const currentXP = levelData.xp || 0;
            const requiredXP = 5 * (levelData.level ** 2) + (50 * levelData.level) + 100;

            const repData = sql.prepare("SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?").get(userId, guildId) || { rep_points: 0 };
            const rankInfo = getRepRankInfo(repData.rep_points);

            const userRaceData = getUserRace(targetMember, sql);
            const raceName = userRaceData ? (RACE_TRANSLATIONS.get(userRaceData.raceName) || userRaceData.raceName) : "مجهول";
            const weaponData = getWeaponData(sql, targetMember);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";
            const weaponDmg = weaponData ? weaponData.currentDamage : 0;
            const maxHp = PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL);

            const streakData = sql.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildId, userId);
            const streakCount = streakData ? streakData.streakCount : 0;
            let hasItemShields = streakData ? (streakData.hasItemShield || 0) : 0;
            let hasGraceShield = (streakData && streakData.hasGracePeriod === 1) ? 1 : 0;
            const totalShields = hasItemShields + hasGraceShield;

            const xpBuffPercent = Math.floor((calculateBuffMultiplier(targetMember, sql) - 1) * 100);
            const moraBuffPercent = Math.floor((calculateMoraBuff(targetMember, sql) - 1) * 100);

            let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
            if (userId !== TARGET_OWNER_ID) {
                const allScores = sql.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY totalXP DESC").all(guildId, TARGET_OWNER_ID);
                let rLvl = allScores.findIndex(s => s.user === userId) + 1;
                ranks.level = rLvl > 0 ? rLvl.toString() : "0";

                const allMora = sql.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY (mora + bank) DESC").all(guildId, TARGET_OWNER_ID);
                let rMora = allMora.findIndex(s => s.user === userId) + 1;
                ranks.mora = rMora > 0 ? rMora.toString() : "0";

                const allStreaks = sql.prepare("SELECT userID FROM streaks WHERE guildID = ? AND userID != ? ORDER BY streakCount DESC").all(guildId, TARGET_OWNER_ID);
                let rStreak = allStreaks.findIndex(s => s.userID === userId) + 1;
                ranks.streak = rStreak > 0 ? rStreak.toString() : "0";

                let rPower = calculateStrongestRank(sql, guildId, userId);
                ranks.power = rPower > 0 ? rPower.toString() : "0";
            }

            // 🛡️ نظام الخصوصية للأونر 🛡️
            let displayMora = totalMora.toLocaleString();
            if (userId === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) {
                displayMora = "???";
            }

            const profileData = {
                user: targetUser,
                displayName: targetMember.displayName || targetUser.username,
                rankInfo: rankInfo,
                repPoints: repData.rep_points,
                level: levelData.level,
                currentXP: currentXP,
                requiredXP: requiredXP,
                mora: displayMora,
                raceName: raceName,
                weaponName: weaponName,
                weaponDmg: weaponDmg,
                maxHp: maxHp,
                streakCount: streakCount,
                xpBuff: xpBuffPercent,
                moraBuff: moraBuffPercent,
                shields: totalShields,
                ranks: ranks
            };

            const buffer = await generateAdventurerCard(profileData);
            const attachment = new AttachmentBuilder(buffer, { name: 'adventurer_card.png' });
            
            await reply({ files: [attachment] });

        } catch (error) {
            console.error("خطأ في أمر البروفايل:", error);
            if (isSlash) await interaction.editReply({ content: "حدث خطأ أثناء تحميل البطاقة." });
            else message.reply("حدث خطأ أثناء تحميل البطاقة.");
        }
    }
};
