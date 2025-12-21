const { EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const potionItems = require('../../json/potions.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const ITEMS_PER_PAGE = 3;

function buildSkillsEmbed(targetUser, cleanName, weaponData, userRace, skillsList, potionsList, totalSpent, page = 0) {
    const embed = new EmbedBuilder()
        .setTitle(`❖ العـتـاد القتالي لـ ${cleanName}`)
        .setColor("Random")
        .setThumbnail(targetUser.displayAvatarURL())
        .setImage("https://i.postimg.cc/nVT4tjm6/123.png");

    // --- قسم السلاح ---
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

    // --- قسم الجرعات ---
    if (potionsList.length > 0) {
        const potionsString = potionsList.map(p => `✬ ${p.name}: (${p.qty})`).join('\n');
        embed.addFields({ name: "❖ حقـيبـة الجرعـات", value: potionsString, inline: false });
    } else {
        embed.addFields({ name: "❖ حقـيبـة الجرعـات", value: "لا توجد جرعات.", inline: false });
    }

    // --- قسم المهارات (مع التصفح) ---
    const totalSkills = skillsList.length;
    const totalPages = Math.ceil(totalSkills / ITEMS_PER_PAGE);
    
    let skillsField = "";
    if (totalSkills > 0) {
        // تحديد البداية والنهاية للصفحة الحالية
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

        const sql = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetUser.displayName);

        // 1. جلب البيانات
        const userRace = getUserRace(targetMember, sql);
        const weaponData = getWeaponData(sql, targetMember);
        const userSkillsDB = sql.prepare("SELECT * FROM user_skills WHERE userID = ? AND guildID = ? AND skillLevel > 0").all(targetUser.id, guild.id);
        
        // جلب الجرعات (إذا كان لديك جدول للمخزون)
        let potionsList = [];
        try {
            const userInventory = sql.prepare("SELECT * FROM user_inventory WHERE userID = ? AND guildID = ? AND quantity > 0").all(targetUser.id, guild.id);
            if (userInventory && userInventory.length > 0) {
                for (const item of userInventory) {
                    const potionInfo = potionItems.find(p => p.id === item.itemID);
                    if (potionInfo) {
                        potionsList.push({ name: `${potionInfo.emoji} ${potionInfo.name}`, qty: item.quantity });
                    }
                }
            }
        } catch (e) {
            // تجاهل الخطأ في حالة عدم وجود جدول الجرعات
        }

        // --- حساب القيمة وتجهيز قائمة المهارات ---
        let totalSpent = 0;
        let skillsList = [];

        // أ) تكلفة السلاح
        if (userRace && weaponData) {
            const originalWeaponConfig = weaponsConfig.find(w => w.race === userRace.raceName);
            if (originalWeaponConfig) {
                for (let i = 0; i < weaponData.currentLevel; i++) {
                    let levelPrice = originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                    totalSpent += levelPrice;
                }
            }
        }

        // ب) مهارة العرق
        if (userRace) {
            const raceSkillId = `race_${userRace.raceName.toLowerCase().replace(/ /g, '_')}_skill`;
            const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
            if (raceSkillConfig) {
                skillsList.push(`✶ ${raceSkillConfig.emoji} ${raceSkillConfig.name} : (Lv.1)\n✶ وصف المهارة: ${raceSkillConfig.description}`);
            }
        }

        // ج) المهارات المشتراة
        if (userSkillsDB.length > 0) {
            for (const dbSkill of userSkillsDB) {
                const skillConfig = skillsConfig.find(s => s.id === dbSkill.skillID);
                if (skillConfig) {
                    skillsList.push(`✶ ${skillConfig.emoji} ${skillConfig.name} : (Lv.${dbSkill.skillLevel})\n✶ وصف المهارة: ${skillConfig.description}`);
                    for (let i = 0; i < dbSkill.skillLevel; i++) {
                        let skillLevelPrice = skillConfig.base_price + (skillConfig.price_increment * i);
                        totalSpent += skillLevelPrice;
                    }
                }
            }
        }

        // --- بناء وإرسال الإيمبد ---
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
                await i.update({ embeds: [newEmbed] });
            });

            collector.on('end', () => {
                msg.edit({ components: [] }).catch(() => {});
            });
        }
    }
};
