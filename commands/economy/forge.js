const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

// 📊 دالة حساب التكلفة والندرة بناءً على اللفل الحالي
function getUpgradeRequirement(currentLevel) {
    if (currentLevel >= 30) return null; // الحد الأقصى
    
    let tierIndex = 0; // 0 = رمادي، 1 = أخضر، 2 = أزرق، 3 = بنفسجي، 4 = ذهبي
    let matCount = 0;
    let moraCost = 0;

    if (currentLevel < 10) { tierIndex = 0; matCount = Math.floor(currentLevel / 2) + 2; moraCost = currentLevel * 1500; }
    else if (currentLevel < 15) { tierIndex = 1; matCount = Math.floor((currentLevel-10) / 2) + 2; moraCost = currentLevel * 3000; }
    else if (currentLevel < 20) { tierIndex = 2; matCount = Math.floor((currentLevel-15) / 2) + 2; moraCost = currentLevel * 6000; }
    else if (currentLevel < 25) { tierIndex = 3; matCount = Math.floor((currentLevel-20) / 2) + 2; moraCost = currentLevel * 12000; }
    else if (currentLevel < 30) { tierIndex = 4; matCount = Math.floor((currentLevel-25) / 2) + 1; moraCost = currentLevel * 25000; }

    return { tierIndex, matCount, moraCost };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('forge')
        .setDescription('الدخول إلى المجمع الإمبراطوري لتطوير الأسلحة وصقل المهارات'),
        
    name: 'تطوير',
    aliases: ['forge', 'حداد', 'صقل'],
    category: 'RPG',
    
    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;

        // إصلاح البريفكس: التفاعل بطريقة تتناسب مع نوع الأمر
        if (isSlash) await interactionOrMessage.deferReply();

        const mainEmbed = new EmbedBuilder()
            .setTitle('🏛️ الـمـجـمـع الإمـبـراطـوري لـلـتـطـويـر')
            .setDescription(`أهلاً بك يا <@${user.id}> في مجمع التطوير.\nصوت المطارق ورائحة السحر تملأ المكان... ماذا تريد أن تفعل اليوم؟\n\nيرجى اختيار القسم من القائمة بالأسفل ⬇️`)
            .setColor(Colors.DarkGold)
            .setImage('https://i.postimg.cc/Qtxzzd2Z/blacksmith-fantasy.png')
            .setFooter({ text: 'الإمبراطورية العظمى - قسم التطوير' });

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`forge_menu_${user.id}`)
                .setPlaceholder('اختر القسم المطلوب...')
                .addOptions([
                    { label: 'ورشة الحدادة (الأسلحة)', value: 'weapon', emoji: '⚒️', description: 'استخدم الخامات لترقية سلاحك العرقي' },
                    { label: 'أكاديمية السحر (المهارات)', value: 'skill_menu', emoji: '📜', description: 'استخدم المخطوطات لصقل مهاراتك' }
                ])
        );

        let replyObj;
        if (isSlash) {
            replyObj = await interactionOrMessage.editReply({ embeds: [mainEmbed], components: [menuRow] });
        } else {
            replyObj = await interactionOrMessage.reply({ embeds: [mainEmbed], components: [menuRow] });
        }

        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 180000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.isStringSelectMenu() && i.customId === `forge_menu_${user.id}`) {
                const choice = i.values[0];
                if (choice === 'weapon') {
                    await buildWeaponForgeUI(i, user, guildId, db, menuRow);
                } else if (choice === 'skill_menu') {
                    await buildAcademyMenuUI(i, user, guildId, db, menuRow);
                }
            } 
            else if (i.isStringSelectMenu() && i.customId === `forge_skill_select_${user.id}`) {
                const selectedSkillId = i.values[0];
                await buildSkillUpgradeUI(i, user, guildId, db, menuRow, selectedSkillId);
            }
            else if (i.isButton()) {
                if (i.customId === 'forge_upgrade_weapon') {
                    await handleWeaponUpgrade(i, user, guildId, db, menuRow);
                } else if (i.customId.startsWith('forge_upgrade_skill_')) {
                    const skillIdToUpgrade = i.customId.replace('forge_upgrade_skill_', '');
                    await handleSkillUpgrade(i, user, guildId, db, menuRow, skillIdToUpgrade);
                }
            }
        });

        collector.on('end', () => {
            try {
                menuRow.components[0].setDisabled(true);
                if (isSlash) interactionOrMessage.editReply({ components: [menuRow] }).catch(()=>{});
                else replyObj.edit({ components: [menuRow] }).catch(()=>{});
            } catch(e) {}
        });
    }
};

// ==========================================
// ⚒️ نظام الحدادة (تطوير الأسلحة)
// ==========================================
async function buildWeaponForgeUI(interaction, user, guildId, db, menuRow) {
    let weaponRes;
    try { weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
    catch(e) { weaponRes = await db.query(`SELECT racename as "raceName", weaponlevel as "weaponLevel" FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})); }
    
    const wData = weaponRes.rows[0];
    if (!wData) {
        const errorEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي سلاح لتقوم بتطويره! احصل على رتبة عرق أولاً.");
        return interaction.editReply({ embeds: [errorEmbed], components: [menuRow] });
    }

    const currentLevel = Number(wData.weaponLevel);
    const weaponConfig = weaponsConfig.find(w => w.race === wData.raceName);
    
    if (currentLevel >= 30) {
        const maxEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ سلاحك **${weaponConfig.name}** وصل للحد الأقصى (Lv.30)! لا يمكن تطويره أكثر.`);
        return interaction.editReply({ embeds: [maxEmbed], components: [menuRow] });
    }

    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === wData.raceName);
    const requiredMaterial = raceMats.materials[reqs.tierIndex];
    const rarityInfo = upgradeMats.rarity_colors[requiredMaterial.rarity];

    let invRes;
    try { invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredMaterial.id]); }
    catch(e) { invRes = await db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredMaterial.id]).catch(()=>({rows:[]})); }
    const userMatCount = invRes.rows[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMora = 0;
    try {
        const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
        userMora = lvlRes.rows[0] ? Number(lvlRes.rows[0].mora) : 0;
    } catch(e) {}

    const hasEnoughMora = userMora >= reqs.moraCost;
    const hasEnoughMats = userMatCount >= reqs.matCount;
    const canUpgrade = hasEnoughMora && hasEnoughMats;

    const currentDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
    const nextDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);

    const embed = new EmbedBuilder()
        .setTitle(`⚒️ ورشة الحدادة - تطوير ${weaponConfig.name}`)
        .setColor(canUpgrade ? Colors.Green : Colors.Red)
        .setDescription(`مرحباً بك في لهب الحدادة.. هل أنت مستعد لتقوية عتادك؟`)
        .addFields(
            { name: '📊 حالة السلاح', value: `> المستوى: **Lv.${currentLevel} ➔ Lv.${currentLevel + 1}**\n> قوة الهجوم: **${currentDmg} ➔ ${nextDmg}** ⚔️`, inline: false },
            { name: '📦 متطلبات التطوير', value: 
                `> ${EMOJI_MORA} مورا: **${userMora.toLocaleString()} / ${reqs.moraCost.toLocaleString()}** ${hasEnoughMora ? '✅' : '❌'}\n` +
                `> ${requiredMaterial.emoji} ${requiredMaterial.name} (${rarityInfo.name}): **${userMatCount} / ${reqs.matCount}** ${hasEnoughMats ? '✅' : '❌'}`, inline: false 
            }
        )
        .setFooter({ text: canUpgrade ? 'أنت جاهز للطرق!' : 'مواردك لا تكفي.. اذهب للدانجون أو السوق لجمعها.' });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تطوير السلاح 🔨').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade)
    );

    await interaction.editReply({ embeds: [embed], components: [menuRow, btnRow] });
}

async function handleWeaponUpgrade(interaction, user, guildId, db, menuRow) {
    let weaponRes;
    try { weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
    catch(e) { weaponRes = await db.query(`SELECT racename as "raceName", weaponlevel as "weaponLevel" FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})); }
    const wData = weaponRes.rows[0];
    const currentLevel = Number(wData.weaponLevel);
    
    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === wData.raceName);
    const requiredMaterial = raceMats.materials[reqs.tierIndex];

    try {
        await db.query('BEGIN'); 
        try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]); }
        catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]); }

        let currentInvRes;
        try { currentInvRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredMaterial.id]); }
        catch(e) { currentInvRes = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredMaterial.id]); }
        
        const invData = currentInvRes.rows[0];
        const newQty = Number(invData.quantity) - reqs.matCount;

        if (newQty > 0) {
            try { await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invData.id]); }
            catch(e) { await db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invData.id]); }
        } else {
            try { await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [invData.id]); }
            catch(e) { await db.query(`DELETE FROM user_inventory WHERE id = $1`, [invData.id]); }
        }

        try { await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName]); }
        catch(e) { await db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, wData.raceName]); }

        await db.query('COMMIT'); 

        const successEmbed = new EmbedBuilder().setTitle(`✨ نجاح التطوير!`).setColor(Colors.LuminousVividPink).setDescription(`تم طرق السلاح بنجاح!\nسلاحك الآن في **Lv.${currentLevel + 1}** ⚔️\nلقد أصبحت أكثر دموية في ساحة المعركة!`);
        await interaction.editReply({ embeds: [successEmbed], components: [menuRow] });

    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await interaction.editReply({ content: "❌ حدث خطأ أثناء عملية الطرق!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 📜 أكاديمية السحر (صقل المهارات)
// ==========================================
async function buildAcademyMenuUI(interaction, user, guildId, db, menuRow) {
    let skillsRes;
    try { skillsRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
    catch(e) { skillsRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})); }
    
    const userSkills = skillsRes.rows;

    if (!userSkills || userSkills.length === 0) {
        const errorEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي مهارات لتصقلها! افتح الصناديق أو اشتري مهارات من السوق أولاً.");
        return interaction.editReply({ embeds: [errorEmbed], components: [menuRow] });
    }

    // بناء قائمة منسدلة بالمهارات الممتلكة
    const skillOptions = [];
    for (const s of userSkills) {
        const skillId = s.skillID || s.skillid;
        const configSkill = skillsConfig.find(sc => sc.id === skillId);
        if (configSkill) {
            skillOptions.push({
                label: configSkill.name,
                value: configSkill.id,
                emoji: configSkill.emoji,
                description: `المستوى الحالي: Lv.${s.skillLevel || s.skilllevel}`
            });
        }
    }

    if (skillOptions.length === 0) {
        return interaction.editReply({ content: "❌ حدث خطأ في تحميل المهارات.", embeds: [], components: [menuRow] });
    }

    const embed = new EmbedBuilder()
        .setTitle('📜 أكاديمية السحر - صقل المهارات')
        .setColor(Colors.DarkPurple)
        .setDescription(`الهدوء يعم الأكاديمية... أمامك العديد من المخطوطات القديمة.\n**اختر المهارة التي تريد صقلها من القائمة بالأسفل:**`);

    const skillSelectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`forge_skill_select_${user.id}`)
            .setPlaceholder('اختر المهارة المطلوب صقلها...')
            .addOptions(skillOptions)
    );

    // نضع القائمة الرئيسية (للعودة) وتحتها قائمة اختيار المهارات
    await interaction.editReply({ embeds: [embed], components: [menuRow, skillSelectRow] });
}

async function buildSkillUpgradeUI(interaction, user, guildId, db, menuRow, skillId) {
    let skillRes;
    try { skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]); }
    catch(e) { skillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})); }
    
    const sData = skillRes.rows[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    
    if (currentLevel >= (configSkill.max_level || 30)) {
        const maxEmbed = new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ مهارة **${configSkill.name}** وصلت للحد الأقصى المطلق!`);
        return interaction.editReply({ embeds: [maxEmbed], components: [menuRow] });
    }

    const reqs = getUpgradeRequirement(currentLevel);
    
    // معرفة نوع الكتاب المطلوب
    const isRaceSkill = skillId.startsWith('race_');
    const categoryName = isRaceSkill ? 'Race_Skills' : 'General_Skills';
    const bookCategory = upgradeMats.skill_books.find(c => c.category === categoryName);
    const requiredBook = bookCategory.books[reqs.tierIndex];
    const rarityInfo = upgradeMats.rarity_colors[requiredBook.rarity];

    let invRes;
    try { invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredBook.id]); }
    catch(e) { invRes = await db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredBook.id]).catch(()=>({rows:[]})); }
    const userBookCount = invRes.rows[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMora = 0;
    try {
        const lvlRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]);
        userMora = lvlRes.rows[0] ? Number(lvlRes.rows[0].mora) : 0;
    } catch(e) {}

    const hasEnoughMora = userMora >= reqs.moraCost;
    const hasEnoughBooks = userBookCount >= reqs.matCount;
    const canUpgrade = hasEnoughMora && hasEnoughBooks;

    const currentVal = configSkill.base_value + (configSkill.value_increment * (currentLevel - 1));
    const nextVal = configSkill.base_value + (configSkill.value_increment * currentLevel);
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';

    const embed = new EmbedBuilder()
        .setTitle(`📜 الأكاديمية - صقل ${configSkill.emoji} ${configSkill.name}`)
        .setColor(canUpgrade ? Colors.Green : Colors.Red)
        .setDescription(`التركيز هو مفتاح السيطرة على هذه المهارة...`)
        .addFields(
            { name: '📊 حالة المهارة', value: `> المستوى: **Lv.${currentLevel} ➔ Lv.${currentLevel + 1}**\n> الفعالية: **${currentVal}${statSymbol} ➔ ${nextVal}${statSymbol}** ✨`, inline: false },
            { name: '📦 متطلبات الصقل', value: 
                `> ${EMOJI_MORA} مورا: **${userMora.toLocaleString()} / ${reqs.moraCost.toLocaleString()}** ${hasEnoughMora ? '✅' : '❌'}\n` +
                `> ${requiredBook.emoji} ${requiredBook.name} (${rarityInfo.name}): **${userBookCount} / ${reqs.matCount}** ${hasEnoughBooks ? '✅' : '❌'}`, inline: false 
            }
        )
        .setFooter({ text: canUpgrade ? 'أنت مستعد لتعلم أسرار هذه المخطوطة!' : 'تحتاج للمزيد من الكتب والمورا.' });

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade)
    );

    // نعيد القائمة الرئيسية لكي يقدر يرجع
    await interaction.editReply({ embeds: [embed], components: [menuRow, btnRow] });
}

async function handleSkillUpgrade(interaction, user, guildId, db, menuRow, skillId) {
    let skillRes;
    try { skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]); }
    catch(e) { skillRes = await db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})); }
    const sData = skillRes.rows[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    
    const reqs = getUpgradeRequirement(currentLevel);
    const isRaceSkill = skillId.startsWith('race_');
    const categoryName = isRaceSkill ? 'Race_Skills' : 'General_Skills';
    const bookCategory = upgradeMats.skill_books.find(c => c.category === categoryName);
    const requiredBook = bookCategory.books[reqs.tierIndex];

    try {
        await db.query('BEGIN'); 

        try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]); }
        catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]); }

        let currentInvRes;
        try { currentInvRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredBook.id]); }
        catch(e) { currentInvRes = await db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredBook.id]); }
        
        const invData = currentInvRes.rows[0];
        const newQty = Number(invData.quantity) - reqs.matCount;

        if (newQty > 0) {
            try { await db.query(`UPDATE user_inventory SET "quantity" = $1 WHERE "id" = $2`, [newQty, invData.id]); }
            catch(e) { await db.query(`UPDATE user_inventory SET quantity = $1 WHERE id = $2`, [newQty, invData.id]); }
        } else {
            try { await db.query(`DELETE FROM user_inventory WHERE "id" = $1`, [invData.id]); }
            catch(e) { await db.query(`DELETE FROM user_inventory WHERE id = $1`, [invData.id]); }
        }

        try { await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]); }
        catch(e) { await db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]); }

        await db.query('COMMIT'); 

        const configSkill = skillsConfig.find(sc => sc.id === skillId);
        const successEmbed = new EmbedBuilder().setTitle(`✨ حكمة جديدة!`).setColor(Colors.LuminousVividPink).setDescription(`استوعبت المعرفة المخبأة في المخطوطة!\nمهارة **${configSkill.name}** الآن في **Lv.${currentLevel + 1}** 📜\nسحرك أصبح أكثر فتكاً!`);
        await interaction.editReply({ embeds: [successEmbed], components: [menuRow] });

    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await interaction.editReply({ content: "❌ حدث خطأ أثناء عملية الصقل!", embeds: [], components: [menuRow] });
    }
}
