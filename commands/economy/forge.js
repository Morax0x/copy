const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

const EMOJI_MORA = '<:mora:1435647151349698621>';

// 📊 دالة حساب التكلفة والندرة بناءً على اللفل الحالي (RPG Scaling)
function getUpgradeRequirement(currentLevel) {
    if (currentLevel >= 30) return null; // الحد الأقصى
    
    // تقسيم المستويات إلى 5 فئات (Tiers)
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

        if (isSlash) await interactionOrMessage.deferReply();

        // 1. الواجهة الرئيسية الترحيبية
        const mainEmbed = new EmbedBuilder()
            .setTitle('🏛️ الـمـجـمـع الإمـبـراطـوري لـلـتـطـويـر')
            .setDescription(`أهلاً بك يا <@${user.id}> في مجمع التطوير.\nصوت المطارق ورائحة السحر تملأ المكان... ماذا تريد أن تفعل اليوم؟\n\nيرجى اختيار القسم من القائمة بالأسفل ⬇️`)
            .setColor(Colors.DarkGold)
            .setImage('https://i.postimg.cc/Qtxzzd2Z/blacksmith-fantasy.png') // يمكنك تغيير الصورة لأي صورة RPG فخمة
            .setFooter({ text: 'الإمبراطورية العظمى - قسم التطوير' });

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`forge_menu_${user.id}`)
                .setPlaceholder('اختر القسم المطلوب...')
                .addOptions([
                    { label: 'ورشة الحدادة (الأسلحة)', value: 'weapon', emoji: '⚒️', description: 'استخدم الخامات لترقية سلاحك العرقي' },
                    { label: 'أكاديمية السحر (المهارات)', value: 'skill', emoji: '📜', description: 'استخدم المخطوطات لصقل مهاراتك' }
                ])
        );

        const replyObj = isSlash ? await interactionOrMessage.editReply({ embeds: [mainEmbed], components: [menuRow] }) : await interactionOrMessage.reply({ embeds: [mainEmbed], components: [menuRow] });

        // 2. معالج التفاعلات (Collector)
        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 120000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate();

            if (i.isStringSelectMenu()) {
                const choice = i.values[0];

                if (choice === 'weapon') {
                    await buildWeaponForgeUI(i, user, guildId, db, menuRow);
                } else if (choice === 'skill') {
                    // يمكنك بناء دالة مشابهة للمهارات لاحقاً
                    await i.editReply({ content: "🚧 **قسم الأكاديمية وصقل المهارات قيد البناء!** سيتم افتتاحه قريباً.", embeds: [], components: [menuRow] });
                }
            } 
            else if (i.isButton() && i.customId.startsWith('forge_upgrade_weapon')) {
                await handleWeaponUpgrade(i, user, guildId, db, menuRow);
            }
        });

        collector.on('end', () => {
            menuRow.components[0].setDisabled(true);
            replyObj.edit({ components: [menuRow] }).catch(()=>{});
        });
    }
};

// ==========================================
// ⚒️ نظام الحدادة (تطوير الأسلحة)
// ==========================================
async function buildWeaponForgeUI(interaction, user, guildId, db, menuRow) {
    // جلب بيانات سلاح اللاعب
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
    
    // جلب الخامة المطلوبة من ملف الموارد
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === wData.raceName);
    const requiredMaterial = raceMats.materials[reqs.tierIndex];
    const rarityInfo = upgradeMats.rarity_colors[requiredMaterial.rarity];

    // جلب مخزون اللاعب من المورا وهذه الخامة
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

    // حساب الضرر القديم والجديد للتشويق
    const currentDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
    const nextDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);

    const embed = new EmbedBuilder()
        .setTitle(`⚒️ ورشة الحدادة - تطوير ${weaponConfig.name}`)
        .setColor(canUpgrade ? Colors.Green : Colors.Red)
        .setThumbnail(weaponConfig.image || null)
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
        new ButtonBuilder()
            .setCustomId(`forge_upgrade_weapon`)
            .setLabel('تطوير السلاح 🔨')
            .setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(!canUpgrade)
    );

    await interaction.editReply({ embeds: [embed], components: [menuRow, btnRow] });
}

// ==========================================
// 🛠️ تنفيذ عملية الحدادة في الداتابيز
// ==========================================
async function handleWeaponUpgrade(interaction, user, guildId, db, menuRow) {
    // 1. إعادة جلب البيانات لضمان عدم وجود تلاعب
    let weaponRes;
    try { weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]); }
    catch(e) { weaponRes = await db.query(`SELECT racename as "raceName", weaponlevel as "weaponLevel" FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})); }
    const wData = weaponRes.rows[0];
    const currentLevel = Number(wData.weaponLevel);
    
    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === wData.raceName);
    const requiredMaterial = raceMats.materials[reqs.tierIndex];

    try {
        await db.query('BEGIN'); // بدء الحماية

        // خصم المورا
        try { await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]); }
        catch(e) { await db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]); }

        // خصم الخامات
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

        // رفع لفل السلاح
        try { await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName]); }
        catch(e) { await db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, wData.raceName]); }

        await db.query('COMMIT'); // تأكيد التغييرات

        const successEmbed = new EmbedBuilder()
            .setTitle(`✨ نجاح التطوير!`)
            .setColor(Colors.LuminousVividPink)
            .setDescription(`تم طرق السلاح بنجاح!\nسلاحك الآن في **Lv.${currentLevel + 1}** ⚔️\nلقد أصبحت أكثر دموية في ساحة المعركة!`)
            .setImage('https://i.postimg.cc/Qtxzzd2Z/blacksmith-fantasy.png'); // صورة نجاح

        // إعادة بناء الواجهة بالبيانات الجديدة للاستمرار بالتطوير
        await interaction.editReply({ embeds: [successEmbed], components: [menuRow] });

    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{}); // إلغاء الخصم لو صار خطأ
        console.error("[Forge Upgrade Error]:", err);
        await interaction.editReply({ content: "❌ حدث خطأ أثناء عملية الطرق! لم يتم خصم شيء من مخزونك.", embeds: [], components: [menuRow] });
    }
}
