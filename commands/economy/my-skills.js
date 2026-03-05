const { EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const potionItems = require('../../json/potions.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const ITEMS_PER_PAGE = 3;
const OWNER_ID = "1145327691772481577"; 

function buildSkillsEmbed(targetUser, cleanName, weaponData, userRace, skillsList, potionsList, totalSpent, page = 0) {
    const embed = new EmbedBuilder()
        .setTitle(`❖ العـتـاد القتالي لـ ${cleanName}`)
        .setColor("Random")
        .setThumbnail(targetUser.displayAvatarURL())
        .setImage("https://i.postimg.cc/nVT4tjm6/123.png");

    if (page === 0) {
        let weaponField = "لا يوجد سلاح مجهز.";
        if (userRace && weaponData) {
            weaponField =
                `**✶ الـسـلاح:** ${weaponData.emoji} ${weaponData.name}\n` +
                `**✶ مستوى السلاح:** \`Lv.${weaponData.currentLevel}\`\n` +
                `**✶ ضـرر السلاح:** \`${weaponData.currentDamage}\` DMG`;
        } else if (userRace && !weaponData) {
            weaponField = `**✶ العرق:** **${userRace.raceName}** (بدون سلاح)`;
        } else {
            weaponField = "لم يتم اختيار عرق بعد.";
        }
        
        embed.addFields({ name: "❖ العـتـاد القتالي", value: weaponField, inline: false });

        if (potionsList.length > 0) {
            const potionsString = potionsList.map(p => `✬ ${p.name}: (${p.qty})`).join('\n');
            embed.addFields({ name: "❖ حقـيبـة الجرعـات", value: potionsString, inline: false });
        } else {
            embed.addFields({ name: "❖ حقـيبـة الجرعـات", value: "لا توجد جرعات.", inline: false });
        }
    }

    const totalSkills = skillsList.length;
    const totalPages = Math.ceil(totalSkills / ITEMS_PER_PAGE) || 1; 
    
    let skillsField = "";
    if (totalSkills > 0) {
        const start = page * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        const currentSkills = skillsList.slice(start, end);
        
        skillsField = currentSkills.join('\n\n');
    } else {
        skillsField = "لا توجد مهارات مكتسبة حالياً.";
    }

    embed.addFields({ name: `❖ المهارات والقـدرات`, value: `✥ قيمـة التطويرات: **${totalSpent.toLocaleString()}** ${EMOJI_MORA}\n\n${skillsField}`, inline: false });

    if (totalPages > 1) {
        embed.setFooter({ text: `صفحة ${page + 1} من ${totalPages}` });
    }

    return { embed, totalPages };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('مهاراتي')
        .setDescription('عرض مهاراتك القتالية وتفاصيل سلاحك.')
        .addUserOption(option =>
            option.setName('المستخدم')
                .setDescription('عرض مهارات عضو آخر (اختياري)')
                .setRequired(false)),

    name: 'my-skills',
    aliases: ['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'],
    category: "Economy",
    description: 'عرض مهاراتك القتالية وتفاصيل سلاحك.',

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
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) return interaction.editReply(payload);
                return interaction.reply(payload);
            }
            return message.reply(payload);
        };

        const db = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetUser.displayName);

        const userRace = await getUserRace(targetMember, db);
        const weaponData = await getWeaponData(db, targetMember);
        
        let userSkillsDB = [];
        try {
            const res = await db.query("SELECT * FROM user_skills WHERE userID = $1 AND guildID = $2 AND skillLevel > 0", [targetUser.id, guild.id]);
            userSkillsDB = res.rows;
        } catch(e) {}
        
        let potionsList = [];
        try {
            const res = await db.query("SELECT * FROM user_inventory WHERE userID = $1 AND guildID = $2 AND quantity > 0", [targetUser.id, guild.id]);
            const userInventory = res.rows;
            if (userInventory && userInventory.length > 0) {
                for (const item of userInventory) {
                    const itemId = item.itemid || item.itemID;
                    const potionInfo = potionItems.find(p => p.id === itemId);
                    if (potionInfo) {
                        potionsList.push({ name: `${potionInfo.emoji} ${potionInfo.name}`, qty: Number(item.quantity) });
                    }
                }
            }
        } catch (e) {}

        let totalSpent = 0;
        let skillsList = [];
        let raceSkillId = null;

        if (userRace && weaponData) {
            const originalWeaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
            if (originalWeaponConfig) {
                for (let i = 0; i < weaponData.currentLevel; i++) {
                    let levelPrice = originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                    totalSpent += levelPrice;
                }
            }
        }

        if (userRace) {
            const cleanRaceName = userRace.raceName.toLowerCase().trim().replace(/\s+/g, '_');
            raceSkillId = `race_${cleanRaceName}_skill`;
        }

        let hasRaceSkillInDB = false;

        if (userSkillsDB.length > 0) {
            for (const dbSkill of userSkillsDB) {
                const skillId = dbSkill.skillid || dbSkill.skillID;
                const skillLvl = Number(dbSkill.skilllevel || dbSkill.skillLevel);

                const skillConfig = skillsConfig.find(s => s.id === skillId);
                
                if (skillConfig) {
                    if (skillConfig.name.includes("شق زمكان") && targetUser.id !== OWNER_ID) {
                        continue; 
                    }

                    if (skillId.startsWith('race_') && raceSkillId && skillId !== raceSkillId) {
                        continue; 
                    }

                    if (raceSkillId && skillId === raceSkillId) {
                        hasRaceSkillInDB = true;
                    }

                    skillsList.push(`✶ ${skillConfig.emoji} ${skillConfig.name} : (Lv.${skillLvl})\n✶ وصف المهارة: ${skillConfig.description}`);
                    
                    for (let i = 0; i < skillLvl; i++) {
                        let skillLevelPrice = skillConfig.base_price + (skillConfig.price_increment * i);
                        totalSpent += skillLevelPrice;
                    }
                }
            }
        }

        if (userRace && raceSkillId && !hasRaceSkillInDB) {
            const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
            if (raceSkillConfig) {
                if (!raceSkillConfig.name.includes("شق زمكان") || targetUser.id === OWNER_ID) {
                     skillsList.push(`✶ ${raceSkillConfig.emoji} ${raceSkillConfig.name} : (Lv.1) [غير مفعلة]\n✶ وصف المهارة: ${raceSkillConfig.description}`);
                }
            }
        }

        let currentPage = 0;
        const { embed, totalPages } = buildSkillsEmbed(targetUser, cleanName, weaponData, userRace, skillsList, potionsList, totalSpent, currentPage);

        let components = [];
        if (totalPages > 1) {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev_page').setEmoji('<:left:1439164494759723029>').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('next_page').setEmoji('<:right:1439164491072929915>').setStyle(ButtonStyle.Secondary)
            );
            components = [row];
        }

        const msg = await reply({ embeds: [embed], components: components, fetchReply: true });

        if (totalPages > 1) {
            const collector = msg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 60000 });

            collector.on('collect', async i => {
                if (i.user.id !== user.id) return i.reply({ content: '❌ هذا الأمر ليس لك.', ephemeral: true });

                if (i.customId === 'prev_page') {
                    currentPage = (currentPage - 1 + totalPages) % totalPages;
                } else if (i.customId === 'next_page') {
                    currentPage = (currentPage + 1) % totalPages;
                }

                const { embed: newEmbed } = buildSkillsEmbed(targetUser, cleanName, weaponData, userRace, skillsList, potionsList, totalSpent, currentPage);
                
                await i.update({ 
                    embeds: [newEmbed] 
                });
            });

            collector.on('end', () => {
                msg.edit({ components: [] }).catch(() => {});
            });
        }
    }
};
