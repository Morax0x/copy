const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const weaponsConfig = require('../json/weapons-config.json');
const skillsConfig = require('../json/skills-config.json');

let generateSkillsCard;
try { ({ generateSkillsCard } = require('../generators/skills-card-generator.js')); } catch (e) { generateSkillsCard = null; }

const SKILLS_PER_PAGE = 3;
const TARGET_OWNER_ID = "1145327691772481577"; 

async function getCombatView(db, targetUser, cleanName, authorId, skillPage, profileContext) {
    const { weaponData, arabicRaceName, userLevel, raceNameRaw, guildId } = profileContext;

    if (!generateSkillsCard) return { content: "❌ لا يمكن رسم بطاقة المهارات حالياً.", components: [] };

    const dbSkills = db.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ?").all(targetUser.id, guildId) || [];

    let totalSpent = 0;
    let allSkillsList = [];
    let raceSkillId = null;

    if (raceNameRaw && weaponData) {
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
            const skillID = dbSkill.skillID;
            const skillLevel = Number(dbSkill.skillLevel);
            const skillConfig = skillsConfig.find(s => s.id === skillID);
            if (skillConfig) {
                if (skillConfig.name.includes("شق زمكان") && targetUser.id !== TARGET_OWNER_ID) continue; 
                if (skillID.startsWith('race_') && raceSkillId && skillID !== raceSkillId) continue; 
                if (raceSkillId && skillID === raceSkillId) hasRaceSkillInDB = true;
                
                allSkillsList.push({ id: skillID, name: skillConfig.name, level: skillLevel, description: skillConfig.description });
                for (let i = 0; i < skillLevel; i++) totalSpent += skillConfig.base_price + (skillConfig.price_increment * i);
            }
        }
    }

    if (raceNameRaw && raceSkillId && !hasRaceSkillInDB) {
        const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
        if (raceSkillConfig && (!raceSkillConfig.name.includes("شق زمكان") || targetUser.id === TARGET_OWNER_ID)) {
            allSkillsList.push({ id: raceSkillId, name: raceSkillConfig.name, level: 1, description: raceSkillConfig.description + " [غير مطورة]" });
        }
    }
    
    allSkillsList.sort((a, b) => b.level - a.level);

    const totalSkillPages = Math.max(1, Math.ceil(allSkillsList.length / SKILLS_PER_PAGE));
    if (skillPage >= totalSkillPages) skillPage = totalSkillPages - 1;
    if (skillPage < 0) skillPage = 0;

    const currentSkillsSlice = allSkillsList.slice(skillPage * SKILLS_PER_PAGE, (skillPage + 1) * SKILLS_PER_PAGE);
    
    const cardData = {
        user: targetUser, 
        avatarUrl: targetUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 }),
        cleanName: cleanName, 
        weaponData: weaponData, 
        raceName: arabicRaceName, 
        skillsList: currentSkillsSlice,
        totalSpent: totalSpent, 
        userLevel: userLevel, 
        currentPage: skillPage, 
        totalPages: totalSkillPages
    };

    const buffer = await generateSkillsCard(cardData);
    const attachment = new AttachmentBuilder(buffer, { name: `skills.png` });

    let components = [];
    if (totalSkillPages > 1) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sk_prev_${authorId}`).setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === 0),
            new ButtonBuilder().setCustomId(`sk_next_${authorId}`).setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary).setDisabled(skillPage === totalSkillPages - 1)
        ));
    }

    return { content: `**⚔️ العتاد والمهارات لـ ${cleanName}**`, files: [attachment], components };
}

module.exports = { getCombatView };
