const { EmbedBuilder, Colors, SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const potionItems = require('../../json/potions.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';
const ITEMS_PER_PAGE = 3;
const OWNER_ID = "1145327691772481577"; // آيدي الأونر (أنت)

function buildSkillsEmbed(targetUser, cleanName, weaponData, userRace, skillsList, potionsList, totalSpent, page = 0) {
    const embed = new EmbedBuilder()
        .setTitle(`❖ العـتـاد القتالي لـ ${cleanName}`)
        .setColor("Random")
        .setThumbnail(targetUser.displayAvatarURL())
        .setImage("https://i.postimg.cc/nVT4tjm6/123.png");

    // عرض المعلومات الأساسية فقط في الصفحة الأولى
    if (page === 0) {
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
    }

    // --- قسم المهارات (مع التصفح) ---
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

        const sql = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

        // 1. جلب البيانات
        const userRace = await getUserRace(sql, targetMember);
        const weaponData = await getWeaponData(sql, targetMember);
        
        // جلب المهارات التي مستواها أكبر من 0
        const userSkillsRes = await sql.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, [targetUser.id, guild.id]);
        const userSkillsDB = userSkillsRes.rows;
        
        // جلب الجرعات
        let potionsList = [];
        try {
            const userInventoryRes = await sql.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "quantity" > 0`, [targetUser.id, guild.id]);
            const userInventory = userInventoryRes.rows;

            if (userInventory && userInventory.length > 0) {
                for (const item of userInventory) {
                    const potionInfo = potionItems.find(p => p.id === (item.itemID || item.itemid));
                    if (potionInfo) {
                        potionsList.push({ name: `${potionInfo.emoji} ${potionInfo.name}`, qty: Number(item.quantity) });
                    }
                }
            }
        } catch (e) {}

        // --- حساب القيمة وتجهيز قائمة المهارات ---
        let totalSpent = 0;
        let skillsList = [];
        let raceSkillId = null;

        // أ) تكلفة السلاح
        if (userRace && weaponData) {
            const originalWeaponConfig = weaponsConfig.find(w => w.race === (userRace.raceName || userRace.racename));
            if (originalWeaponConfig) {
                for (let i = 0; i < weaponData.currentLevel; i++) {
                    let levelPrice = originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                    totalSpent += levelPrice;
                }
            }
        }

        // ب) تحديد هوية مهارة العرق (للمقارنة لاحقاً)
        if (userRace) {
            const cleanRaceName = (userRace.raceName || userRace.racename).toLowerCase().trim().replace(/\s+/g, '_');
            raceSkillId = `race_${cleanRaceName}_skill`;
        }

        // ج) عرض المهارات وتصفيتها
        let hasRaceSkillInDB = false;

        if (userSkillsDB.length > 0) {
            for (const dbSkill of userSkillsDB) {
                const skillID = dbSkill.skillID || dbSkill.skillid;
                const skillLevel = Number(dbSkill.skillLevel || dbSkill.skilllevel);
                const skillConfig = skillsConfig.find(s => s.id === skillID);
                
                if (skillConfig) {
                    // ========================================================
                    // 🔥 1. فلتر الأونر (يخفي شق زمكان عن أي أحد غيرك)
                    // ========================================================
                    if (skillConfig.name.includes("شق زمكان") && targetUser.id !== OWNER_ID) {
                        continue; // تخطي هذه المهارة، لا تعرضها ولا تحسب سعرها
                    }

                    // ========================================================
                    // 🔥 2. فلتر العرق (يخفي مهارات العروق السابقة)
                    // ========================================================
                    // إذا كانت المهارة تبدأ بـ race_ وليست هي مهارة العرق الحالي -> تخطي
                    if (skillID.startsWith('race_') && raceSkillId && skillID !== raceSkillId) {
                        continue; 
                    }

                    // التحقق هل هذه هي مهارة العرق الحالي؟
                    if (raceSkillId && skillID === raceSkillId) {
                        hasRaceSkillInDB = true;
                    }

                    // إضافة المهارة للقائمة
                    skillsList.push(`✶ ${skillConfig.emoji} ${skillConfig.name} : (Lv.${skillLevel})\n✶ وصف المهارة: ${skillConfig.description}`);
                    
                    // حساب تكلفة التطويرات لهذه المهارة
                    for (let i = 0; i < skillLevel; i++) {
                        let skillLevelPrice = skillConfig.base_price + (skillConfig.price_increment * i);
                        totalSpent += skillLevelPrice;
                    }
                }
            }
        }

        // د) إذا كان لديه عرق، ولكن المهارة غير مسجلة في الداتابيس
        if (userRace && raceSkillId && !hasRaceSkillInDB) {
            const raceSkillConfig = skillsConfig.find(s => s.id === raceSkillId);
            if (raceSkillConfig) {
                // تأكد أيضاً إن مهارة العرق هذي مو "شق زمكان" (ولو إن المفروض لها عرق خاص، بس احتياط)
                if (!raceSkillConfig.name.includes("شق زمكان") || targetUser.id === OWNER_ID) {
                     skillsList.push(`✶ ${raceSkillConfig.emoji} ${raceSkillConfig.name} : (Lv.1) [غير مفعلة]\n✶ وصف المهارة: ${raceSkillConfig.description}`);
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
