const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');
const weaponsConfig = require('../../json/weapons-config.json');

// استدعاء المصمم الفخم 
const { generateSkillsCard } = require('../../generators/skills-card-generator.js'); 

const OWNER_ID = "1145327691772481577"; 
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';

// مترجم الأعراق إلى العربية
const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'], 
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مهاراتي')
        .setDescription('عرض مهاراتك القتالية وتفاصيل سلاحك بصورة فخمة.')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('عرض مهارات عضو آخر (اختياري)')
                .setRequired(false)),

    name: 'my-skills',
    aliases: ['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'],
    category: "Economy",
    description: 'عرض مهاراتك القتالية وتفاصيل سلاحك بصورة فخمة.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, user;
        let targetMember;

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            user = interaction.user;
            targetMember = interaction.options.getMember('المستخدم') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            user = message.author;
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
            message.channel.sendTyping().catch(()=>{}); 
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return await interaction.editReply(payload);
                return await interaction.reply({ ...payload, fetchReply: true });
            }
            return await message.reply(payload);
        };

        const sql = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);
        const avatarUrl = targetUser.displayAvatarURL({ extension: 'png', forceStatic: true, size: 256 });

        // جلب البيانات من الداتا بيز
        const userRace = await getUserRace(targetMember, sql);
        const weaponData = await getWeaponData(sql, targetMember);
        
        let userSkillsRes;
        try { userSkillsRes = await sql.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, [targetUser.id, guild.id]); }
        catch(e) { userSkillsRes = await sql.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skilllevel > 0`, [targetUser.id, guild.id]).catch(()=>({rows:[]})); }
        const userSkillsDB = userSkillsRes.rows;

        let userLvlRes;
        try { userLvlRes = await sql.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [targetUser.id, guild.id]); }
        catch(e) { userLvlRes = await sql.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [targetUser.id, guild.id]).catch(()=>({rows:[]})); }
        const userLevel = userLvlRes.rows[0] ? Number(userLvlRes.rows[0].level) : 1;

        let totalSpent = 0;
        let allSkills = [];
        let raceSkillId = null;

        // 🔥 ترجمة اسم العرق 🔥
        const rawRace = userRace ? (userRace.raceName || userRace.racename) : "مجهول";
        const arabicRaceName = RACE_TRANSLATIONS.get(rawRace) || rawRace;

        if (userRace && weaponData) {
            const originalWeaponConfig = weaponsConfig.find(w => w.race === rawRace);
            if (originalWeaponConfig) {
                for (let i = 0; i < weaponData.currentLevel; i++) {
                    totalSpent += originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                }
            }
        }

        if (userRace) {
            const cleanRaceName = rawRace.toLowerCase().trim().replace(/\s+/g, '_');
            raceSkillId = `race_${cleanRaceName}_skill`;
        }

        let hasRaceSkillInDB = false;

        if (userSkillsDB.length > 0) {
            for (const dbSkill of userSkillsDB) {
                const skillID = dbSkill.skillID || dbSkill.skillid;
                const skillLevel = Number(dbSkill.skillLevel || dbSkill.skilllevel);
                const skillConfig = skillsConfig.find(s => s.id === skillID);
                
                if (skillConfig) {
                    if (skillConfig.name.includes("شق زمكان") && targetUser.id !== OWNER_ID) continue; 
                    if (skillID.startsWith('race_') && raceSkillId && skillID !== raceSkillId) continue; 

                    if (raceSkillId && skillID === raceSkillId) hasRaceSkillInDB = true;

                    allSkills.push({
                        id: skillID, 
                        name: skillConfig.name,
                        level: skillLevel,
                        description: skillConfig.description
                    });
                    
                    for (let i = 0; i < skillLevel; i++) {
                        totalSpent += skillConfig.base_price + (skillConfig.price_increment * i);
                    }
                }
            }
        }

        if (userRace && raceSkillId && !hasRaceSkillInDB) {
            const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
            if (raceSkillConfig && (!raceSkillConfig.name.includes("شق زمكان") || targetUser.id === OWNER_ID)) {
                allSkills.push({
                    id: raceSkillId,
                    name: raceSkillConfig.name,
                    level: 1, 
                    description: raceSkillConfig.description + " [غير مطورة]"
                });
            }
        }

        allSkills.sort((a, b) => b.level - a.level);

        let currentPage = 0;
        const ITEMS_PER_PAGE = 3;
        const totalPages = Math.max(1, Math.ceil(allSkills.length / ITEMS_PER_PAGE));

        const getButtons = (page) => {
            if (totalPages <= 1) return [];
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev_skills_page').setEmoji(LEFT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next_skills_page').setEmoji(RIGHT_EMOJI).setStyle(ButtonStyle.Secondary).setDisabled(page === totalPages - 1)
            );
            return [row];
        };

        try {
            const currentSkillsSlice = allSkills.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
            
            const cardData = {
                user: targetUser,
                avatarUrl: avatarUrl,
                cleanName: cleanName,
                weaponData: weaponData,
                raceName: arabicRaceName, // إرسال العرق مترجماً
                skillsList: currentSkillsSlice,
                totalSpent: totalSpent,
                userLevel: userLevel,
                currentPage: currentPage,
                totalPages: totalPages
            };

            const buffer = await generateSkillsCard(cardData);
            let attachment = new AttachmentBuilder(buffer, { name: `skills-${targetUser.id}-${currentPage}.png` });

            const responseMsg = await reply({ files: [attachment], components: getButtons(currentPage) });

            if (totalPages > 1 && responseMsg) {
                const collector = responseMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
                
                collector.on('collect', async i => {
                    if (i.user.id !== user.id) return i.reply({ content: '❌ هذا الأمر ليس لك.', flags: [MessageFlags.Ephemeral] });

                    if (i.customId === 'prev_skills_page') currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === 'next_skills_page') currentPage = Math.min(totalPages - 1, currentPage + 1);

                    await i.deferUpdate();

                    const newSlice = allSkills.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
                    cardData.skillsList = newSlice;
                    cardData.currentPage = currentPage;

                    const newBuffer = await generateSkillsCard(cardData);
                    const newAttachment = new AttachmentBuilder(newBuffer, { name: `skills-${targetUser.id}-${currentPage}.png` });

                    await i.editReply({ files: [newAttachment], components: getButtons(currentPage), attachments: [] });
                });
                
                collector.on('end', () => { responseMsg.edit({ components: [] }).catch(()=>{}); });
            }

        } catch (error) {
            console.error("Error generating or sending image:", error);
            if (!isSlash) message.reply("❌ حدث خطأ أثناء توليد الصورة.");
            else interaction.editReply({ content: "❌ حدث خطأ أثناء توليد الصورة." });
        }
    }
};
