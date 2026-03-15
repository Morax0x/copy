const { SlashCommandBuilder, AttachmentBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { createCanvas, loadImage } = require('canvas');
const { getUserRace, getWeaponData, cleanDisplayName } = require('../../handlers/pvp-core.js');
const skillsConfig = require('../../json/skills-config.json');
const weaponsConfig = require('../../json/weapons-config.json');
const potionItems = require('../../json/potions.json');

// إعدادات التصميم
const IMAGE_URL = "https://i.postimg.cc/8cm7X398/design.png";
const OWNER_ID = "1145327691772481577"; // آيدي الأونر
const LEFT_EMOJI = '<:left:1439164494759723029>';
const RIGHT_EMOJI = '<:right:1439164491072929915>';

// دالة مساعدة لرسم النصوص الطويلة (الوصف) داخل مربع محدد
function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let testFnnt = ctx.font;
    
    if (text.length > 100) ctx.font = ctx.font.replace(/\d+px/, '14px');
    else if (text.length > 60) ctx.font = ctx.font.replace(/\d+px/, '16px');

    for (let n = 0; n < words.length; n++) {
        let testLine = line + words[n] + ' ';
        let metrics = ctx.measureText(testLine);
        let testWidth = metrics.width;
        if (testWidth > maxWidth && n > 0) {
            ctx.fillText(line, x, y);
            line = words[n] + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }
    ctx.fillText(line, x, y);
    ctx.font = testFnnt; 
}

async function generateSkillsImage(targetUser, cleanName, weaponData, userRace, skillsListSlice, potionsList, totalSpent, currentPage, totalPages) {
    const baseImage = await loadImage(IMAGE_URL);
    const avatar = await loadImage(targetUser.displayAvatarURL({ extension: 'png', size: 256 }));

    const canvas = createCanvas(baseImage.width, baseImage.height);
    const ctx = canvas.getContext('2d');

    ctx.patternQuality = 'best';
    ctx.quality = 'best';
    ctx.imageSmoothingEnabled = true;

    // رسم الخلفية
    ctx.drawImage(baseImage, 0, 0);

    // تأثير توهج خلف الرمز الشخصي
    ctx.shadowColor = 'rgba(255, 215, 0, 0.5)'; 
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // رسم الرمز الشخصي (دائري مع إطار ذهبي)
    const avatarX = 66;
    const avatarY = 88;
    const avatarSize = 145;

    ctx.save(); 
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip(); 
    ctx.drawImage(avatar, avatarX, avatarY, avatarSize, avatarSize);
    ctx.restore(); 
    
    ctx.shadowBlur = 0; 

    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2, true);
    ctx.stroke();

    // كتابة اسم المستخدم
    ctx.fillStyle = '#ffffff'; 
    ctx.font = 'bold 28px Sans-Serif'; 
    ctx.textAlign = 'center';
    ctx.fillText(cleanName, avatarX + avatarSize / 2, avatarY - 20);

    // بيانات العتاد والجرعات
    ctx.textAlign = 'left';
    ctx.fillStyle = '#e0e0e0';
    let currentY = 320;
    const leftX = 70;
    const lineHeight = 35;

    ctx.font = 'bold 24px Sans-Serif';
    ctx.fillStyle = '#FFD700'; 
    ctx.fillText("❖ العـتـاد القتالي", leftX, currentY);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Sans-Serif';
    currentY += lineHeight + 5;

    if (userRace && weaponData) {
        ctx.fillText(`✶ السلاح: ${weaponData.name}`, leftX, currentY);
        currentY += lineHeight;
        ctx.fillText(`✶ المستوى: Lv.${weaponData.currentLevel}`, leftX, currentY);
        currentY += lineHeight;
        ctx.fillStyle = '#ff4d4d'; 
        ctx.fillText(`✶ الضرر: ${weaponData.currentDamage} DMG`, leftX, currentY);
        ctx.fillStyle = '#ffffff';
    } else if (userRace && !weaponData) {
        ctx.fillText(`✶ العرق: ${userRace.raceName || userRace.racename}`, leftX, currentY);
        currentY += lineHeight;
        ctx.fillText(`(بدون سلاح مجهز)`, leftX, currentY);
    } else {
        ctx.fillText(`لم يتم اختيار عرق بعد.`, leftX, currentY);
    }

    currentY += 50;
    ctx.font = 'bold 24px Sans-Serif';
    ctx.fillStyle = '#FFD700';
    ctx.fillText("❖ حقـيبـة الجرعـات", leftX, currentY);
    ctx.fillStyle = '#ffffff';
    ctx.font = '20px Sans-Serif';
    currentY += lineHeight + 5;

    if (potionsList.length > 0) {
        potionsList.slice(0, 4).forEach(p => {
            ctx.fillText(`✬ ${p.name}: (${p.qty})`, leftX, currentY);
            currentY += lineHeight;
        });
        if (potionsList.length > 4) ctx.fillText(`... وخيارات أخرى`, leftX, currentY);
    } else {
        ctx.fillText("لا توجد جرعات.", leftX, currentY);
    }

    // رسم المهارات (بالصفحة الحالية)
    const rightX = 325;
    let skillY = 95;
    const skillBoxWidth = 580;

    ctx.textAlign = 'right';
    ctx.font = 'bold 22px Sans-Serif';
    ctx.fillStyle = '#bebebe';
    ctx.fillText(`قيمة التطويرات: ${totalSpent.toLocaleString()} مورا`, canvas.width - 60, 50);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 28px Sans-Serif';
    ctx.fillText("❖ المهارات والقـدرات المكتسبة", rightX, skillY);
    skillY += 50;

    if (skillsListSlice.length > 0) {
        skillsListSlice.forEach((skill, index) => {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
            ctx.fillRect(rightX - 10, skillY - 30, skillBoxWidth, 120);
            
            ctx.fillStyle = (index === 0) ? '#ffcc00' : (index === 1) ? '#00ccff' : '#cc33ff'; 
            ctx.fillRect(rightX - 10, skillY - 30, 5, 120);

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 22px Sans-Serif';
            ctx.fillText(`${skill.emoji} ${skill.name} (Lv.${skill.level})`, rightX + 10, skillY);
            
            skillY += 30;
            ctx.fillStyle = '#b0b0b0';
            ctx.font = '18px Sans-Serif';
            wrapText(ctx, skill.description, rightX + 10, skillY, skillBoxWidth - 20, 22);
            
            skillY += 90; 
        });
    } else {
        ctx.fillStyle = '#ffffff';
        ctx.font = '22px Sans-Serif';
        ctx.fillText("لا توجد مهارات مكتسبة حالياً.", rightX, skillY);
    }

    // كتابة رقم الصفحة أسفل يمين الصورة إذا كان هناك أكثر من صفحة
    if (totalPages > 1) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 18px Sans-Serif';
        ctx.fillText(`صفحة ${currentPage + 1} من ${totalPages}`, canvas.width - 40, canvas.height - 30);
    }

    return new AttachmentBuilder(canvas.toBuffer(), { name: `skills-${targetUser.id}-${currentPage}.png` });
}

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
        }

        const reply = async (payload) => {
            if (isSlash) {
                if (interaction.replied || interaction.deferred) {
                    const msg = await interaction.editReply(payload);
                    return msg;
                }
                const msg = await interaction.reply({ ...payload, fetchReply: true });
                return msg;
            }
            return await message.reply(payload);
        };

        const sql = client.sql;
        const targetUser = targetMember.user;
        const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

        const userRace = await getUserRace(targetMember, sql);
        const weaponData = await getWeaponData(sql, targetMember);
        
        const userSkillsRes = await sql.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillLevel" > 0`, [targetUser.id, guild.id]);
        const userSkillsDB = userSkillsRes.rows;
        
        let potionsList = [];
        try {
            const userInventoryRes = await sql.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "quantity" > 0`, [targetUser.id, guild.id]);
            const userInventory = userInventoryRes.rows;

            if (userInventory && userInventory.length > 0) {
                for (const item of userInventory) {
                    const potionInfo = potionItems.find(p => p.id === (item.itemID || item.itemid));
                    if (potionInfo) {
                        potionsList.push({ name: potionInfo.name, emoji: potionInfo.emoji, qty: Number(item.quantity) });
                    }
                }
            }
        } catch (e) {
            console.error("Error fetching inventory:", e);
        }

        let totalSpent = 0;
        let finalSkillsForImage = [];
        let raceSkillId = null;

        if (userRace && weaponData) {
            const originalWeaponConfig = weaponsConfig.find(w => w.race === (userRace.raceName || userRace.racename));
            if (originalWeaponConfig) {
                for (let i = 0; i < weaponData.currentLevel; i++) {
                    let levelPrice = originalWeaponConfig.base_price + (originalWeaponConfig.price_increment * i);
                    totalSpent += levelPrice;
                }
            }
        }

        if (userRace) {
            const cleanRaceName = (userRace.raceName || userRace.racename).toLowerCase().trim().replace(/\s+/g, '_');
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

                    finalSkillsForImage.push({
                        name: skillConfig.name,
                        emoji: skillConfig.emoji,
                        level: skillLevel,
                        description: skillConfig.description
                    });
                    
                    for (let i = 0; i < skillLevel; i++) {
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
                    finalSkillsForImage.push({
                        name: raceSkillConfig.name,
                        emoji: raceSkillConfig.emoji,
                        level: 1, 
                        description: raceSkillConfig.description + " [غير مطورة]"
                    });
                }
            }
        }

        finalSkillsForImage.sort((a, b) => b.level - a.level);

        // إعدادات الصفحات
        let currentPage = 0;
        const ITEMS_PER_PAGE = 3;
        const totalPages = Math.max(1, Math.ceil(finalSkillsForImage.length / ITEMS_PER_PAGE));

        const getButtons = (page) => {
            if (totalPages <= 1) return [];
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev_skills_page')
                    .setEmoji(LEFT_EMOJI)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next_skills_page')
                    .setEmoji(RIGHT_EMOJI)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === totalPages - 1)
            );
            return [row];
        };

        try {
            let waitingMsg = null;
            if (!isSlash) {
                waitingMsg = await message.reply("🛠️ جاري صقل عتادك وعرضه...");
            }

            // رسم وقطع المهارات للصفحة الحالية
            const currentSkillsSlice = finalSkillsForImage.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
            let attachment = await generateSkillsImage(targetUser, cleanName, weaponData, userRace, currentSkillsSlice, potionsList, totalSpent, currentPage, totalPages);

            const responseMsg = await reply({ files: [attachment], components: getButtons(currentPage) });

            if (waitingMsg) waitingMsg.delete().catch(()=>{});

            // تفعيل نظام الأزرار والتنقل
            if (totalPages > 1 && responseMsg) {
                const collector = responseMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 120000 });
                
                collector.on('collect', async i => {
                    if (i.user.id !== user.id) return i.reply({ content: '❌ هذا الأمر ليس لك.', flags: [MessageFlags.Ephemeral] });

                    if (i.customId === 'prev_skills_page') currentPage = Math.max(0, currentPage - 1);
                    else if (i.customId === 'next_skills_page') currentPage = Math.min(totalPages - 1, currentPage + 1);

                    await i.deferUpdate();

                    const newSlice = finalSkillsForImage.slice(currentPage * ITEMS_PER_PAGE, (currentPage + 1) * ITEMS_PER_PAGE);
                    const newAttachment = await generateSkillsImage(targetUser, cleanName, weaponData, userRace, newSlice, potionsList, totalSpent, currentPage, totalPages);

                    await i.editReply({ files: [newAttachment], components: getButtons(currentPage), attachments: [] });
                });
                
                collector.on('end', () => {
                    responseMsg.edit({ components: [] }).catch(()=>{});
                });
            }

        } catch (error) {
            console.error("Error generating or sending image:", error);
            if (!isSlash) message.reply("❌ حدث خطأ أثناء توليد الصورة.");
            else interaction.editReply({ content: "❌ حدث خطأ أثناء توليد الصورة." });
        }
    }
};
