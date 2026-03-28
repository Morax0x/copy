const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, MessageFlags } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

// استدعاء دالة إضافة الـ XP المركزية
let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

const EMOJI_MORA = '<:mora:1435647151349698621>';
const SMELT_XP_RATES = { 'Common': 10, 'Uncommon': 20, 'Rare': 30, 'Epic': 100, 'Legendary': 1000 };
const SYNTHESIS_FEE = 5000;

function getUpgradeRequirement(currentLevel) {
    if (currentLevel >= 30) return null; 
    let tierIndex = 0, matCount = 0, moraCost = 0;

    if (currentLevel < 10) { tierIndex = 0; matCount = Math.floor(currentLevel / 2) + 2; moraCost = currentLevel * 1500; }
    else if (currentLevel < 15) { tierIndex = 1; matCount = Math.floor((currentLevel-10) / 2) + 2; moraCost = currentLevel * 3000; }
    else if (currentLevel < 20) { tierIndex = 2; matCount = Math.floor((currentLevel-15) / 2) + 2; moraCost = currentLevel * 6000; }
    else if (currentLevel < 25) { tierIndex = 3; matCount = Math.floor((currentLevel-20) / 2) + 2; moraCost = currentLevel * 12000; }
    else if (currentLevel < 30) { tierIndex = 4; matCount = Math.floor((currentLevel-25) / 2) + 1; moraCost = currentLevel * 25000; }

    return { tierIndex, matCount, moraCost };
}

function getItemInfo(itemId) {
    for (const r of upgradeMats.weapon_materials) {
        const mat = r.materials.find(m => m.id === itemId);
        if (mat) return { ...mat, type: 'material', race: r.race };
    }
    for (const c of upgradeMats.skill_books) {
        const book = c.books.find(b => b.id === itemId);
        if (book) return { ...book, type: 'book' };
    }
    return null;
}

module.exports = {
    data: new SlashCommandBuilder().setName('forge').setDescription('الدخول إلى المجمع الإمبراطوري لتطوير الأسلحة وصقل المهارات'),
    name: 'تطوير',
    aliases: ['forge', 'حداد', 'صقل', 'دمج', 'صهر'],
    category: 'RPG',
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;

        if (isSlash) await interactionOrMessage.deferReply();

        let userDataRes = await db.query(`SELECT "mora", "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora, level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
        if (!userDataRes?.rows?.[0]) return isSlash ? interactionOrMessage.editReply("❌ لم يتم العثور على بياناتك.") : interactionOrMessage.reply("❌ لم يتم العثور على بياناتك.");

        const mainEmbed = new EmbedBuilder()
            .setTitle('🏛️ الـمـجـمـع الإمـبـراطـوري لـلـتـطـويـر')
            .setDescription(`أهلاً بك يا <@${user.id}> في مجمع التطوير.\nصوت المطارق ورائحة السحر تملأ المكان... ماذا تريد أن تفعل اليوم؟\n\nيرجى اختيار القسم من القائمة بالأسفل ⬇️`)
            .setColor(Colors.DarkGold)
            .setImage('https://i.postimg.cc/Qtxzzd2Z/blacksmith-fantasy.png')
            .setFooter({ text: 'الإمبراطورية العظمى - قسم التطوير' });

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`forge_menu_main`).setPlaceholder('اختر القسم المطلوب...').addOptions([
                { label: 'ورشة الحدادة (الأسلحة)', value: 'weapon', emoji: '⚒️', description: 'استخدم الخامات لترقية سلاحك العرقي' },
                { label: 'أكاديمية السحر (المهارات)', value: 'skill_menu', emoji: '📜', description: 'استخدم المخطوطات لصقل مهاراتك' },
                { label: 'فرن الدمج (استبدال العناصر)', value: 'synthesis', emoji: '🔄', description: 'ادمج 4 عناصر لتحصل على عنصر من اختيارك' },
                { label: 'محرقة التفكيك (صهر للخبرة)', value: 'smelting', emoji: '🔥', description: 'احرق العناصر الزائدة مقابل XP' }
            ])
        );

        let replyObj = await (isSlash ? interactionOrMessage.editReply({ embeds: [mainEmbed], components: [menuRow] }) : interactionOrMessage.reply({ embeds: [mainEmbed], components: [menuRow] }));

        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 300000 });

        let synthesisState = { sacrificeItem: null, targetItem: null };
        let smeltState = { item: null };

        collector.on('collect', async (i) => {
            try { await i.deferUpdate(); } catch(e) {}

            if (i.customId === 'forge_menu_main') {
                const choice = i.values[0];
                if (choice === 'weapon') await buildWeaponForgeUI(i, user, guildId, db, menuRow);
                else if (choice === 'skill_menu') await buildAcademyMenuUI(i, user, guildId, db, menuRow);
                else if (choice === 'synthesis') { synthesisState = { sacrificeItem: null, targetItem: null }; await buildSynthesisUI(i, user, guildId, db, menuRow, synthesisState); }
                else if (choice === 'smelting') { smeltState = { item: null }; await buildSmeltingUI(i, user, guildId, db, menuRow, smeltState); }
            } 
            else if (i.customId === 'forge_skill_select') {
                await buildSkillUpgradeUI(i, user, guildId, db, menuRow, i.values[0]);
            }
            else if (i.customId === 'forge_synth_sacrifice') {
                synthesisState.sacrificeItem = i.values[0];
                synthesisState.targetItem = null; 
                await buildSynthesisUI(i, user, guildId, db, menuRow, synthesisState);
            }
            else if (i.customId === 'forge_synth_target') {
                synthesisState.targetItem = i.values[0];
                await buildSynthesisUI(i, user, guildId, db, menuRow, synthesisState);
            }
            else if (i.customId === 'forge_smelt_select') {
                smeltState.item = i.values[0];
                await buildSmeltingUI(i, user, guildId, db, menuRow, smeltState);
            }
            else if (i.isButton()) {
                if (i.customId === 'forge_upgrade_weapon') await handleWeaponUpgrade(i, user, guildId, db, menuRow);
                else if (i.customId.startsWith('forge_upgrade_skill_')) await handleSkillUpgrade(i, user, guildId, db, menuRow, i.customId.replace('forge_upgrade_skill_', ''));
                else if (i.customId === 'forge_execute_synth') await handleSynthesis(i, user, guildId, db, menuRow, synthesisState);
                else if (i.customId === 'forge_execute_smelt') await handleSmelting(i, user, guildId, db, menuRow, smeltState, client);
            }
        });

        collector.on('end', () => {
            try { menuRow.components[0].setDisabled(true); replyObj.edit({ components: [menuRow] }).catch(()=>{}); } catch(e) {}
        });
    }
};

// ==========================================
// ⚒️ 1. نظام الحدادة (تطوير الأسلحة)
// ==========================================
async function buildWeaponForgeUI(i, user, guildId, db, menuRow) {
    let weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const wData = weaponRes?.rows?.[0];
    if (!wData) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي سلاح! احصل على رتبة عرق أولاً.")], components: [menuRow] });

    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    
    if (currentLevel >= 30) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ سلاحك وصل للحد الأقصى (Lv.30)!`)], components: [menuRow] });

    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));
    const requiredMaterial = raceMats.materials[reqs.tierIndex];
    const rarityInfo = upgradeMats.rarity_colors[requiredMaterial.rarity];

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredMaterial.id]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredMaterial.id]).catch(()=>({rows:[]})));
    const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    const canUpgrade = userMora >= reqs.moraCost && userMatCount >= reqs.matCount;
    const currentDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
    const nextDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);

    const embed = new EmbedBuilder().setTitle(`⚒️ ورشة الحدادة - تطوير ${weaponConfig.name}`).setColor(canUpgrade ? Colors.Green : Colors.Red).setDescription(`هل أنت مستعد لتقوية عتادك؟`)
        .addFields(
            { name: '📊 حالة السلاح', value: `> المستوى: **Lv.${currentLevel} ➔ Lv.${currentLevel + 1}**\n> قوة الهجوم: **${currentDmg} ➔ ${nextDmg}** ⚔️`, inline: false },
            { name: '📦 متطلبات التطوير', value: `> ${EMOJI_MORA} مورا: **${userMora.toLocaleString()} / ${reqs.moraCost.toLocaleString()}** ${userMora >= reqs.moraCost ? '✅' : '❌'}\n> ${requiredMaterial.emoji} ${requiredMaterial.name}: **${userMatCount} / ${reqs.matCount}** ${userMatCount >= reqs.matCount ? '✅' : '❌'}`, inline: false }
        );

    const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تطوير السلاح 🔨').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade));
    await i.editReply({ embeds: [embed], components: [menuRow, btnRow] });
}

async function handleWeaponUpgrade(i, user, guildId, db, menuRow) {
    let weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const wData = weaponRes?.rows?.[0];
    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));
    const requiredMaterial = raceMats.materials[reqs.tierIndex];

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [reqs.matCount, user.id, guildId, requiredMaterial.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [reqs.matCount, user.id, guildId, requiredMaterial.id]));
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName || wData.racename]).catch(()=> db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, wData.raceName || wData.racename]));
        await db.query('COMMIT').catch(()=>{}); 
        
        await i.editReply({ embeds: [new EmbedBuilder().setTitle(`✨ نجاح التطوير!`).setColor(Colors.LuminousVividPink).setDescription(`سلاحك الآن في **Lv.${currentLevel + 1}** ⚔️`)], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ content: "❌ حدث خطأ!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 📜 2. أكاديمية السحر (صقل المهارات)
// ==========================================
async function buildAcademyMenuUI(i, user, guildId, db, menuRow) {
    let skillsRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userSkills = skillsRes?.rows || [];

    if (userSkills.length === 0) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي مهارات لتصقلها!")], components: [menuRow] });

    const skillOptions = userSkills.map(s => {
        const configSkill = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
        return configSkill ? { label: configSkill.name, value: configSkill.id, emoji: configSkill.emoji, description: `Lv.${s.skillLevel || s.skilllevel}` } : null;
    }).filter(Boolean);

    const embed = new EmbedBuilder().setTitle('📜 أكاديمية السحر').setColor(Colors.DarkPurple).setDescription(`**اختر المهارة التي تريد صقلها:**`);
    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر المهارة...').addOptions(skillOptions.slice(0, 25)));

    await i.editReply({ embeds: [embed], components: [menuRow, skillSelectRow] });
}

async function buildSkillUpgradeUI(i, user, guildId, db, menuRow, skillId) {
    let skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})));
    const sData = skillRes?.rows?.[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    
    if (currentLevel >= (configSkill.max_level || 30)) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ مهارة **${configSkill.name}** وصلت للحد الأقصى!`)], components: [menuRow] });

    const reqs = getUpgradeRequirement(currentLevel);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const requiredBook = upgradeMats.skill_books.find(c => c.category === categoryName).books[reqs.tierIndex];

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredBook.id]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredBook.id]).catch(()=>({rows:[]})));
    const userBookCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    const canUpgrade = userMora >= reqs.moraCost && userBookCount >= reqs.matCount;
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';

    const embed = new EmbedBuilder().setTitle(`📜 الأكاديمية - صقل ${configSkill.emoji} ${configSkill.name}`).setColor(canUpgrade ? Colors.Green : Colors.Red)
        .addFields(
            { name: '📊 حالة المهارة', value: `> المستوى: **Lv.${currentLevel} ➔ Lv.${currentLevel + 1}**`, inline: false },
            { name: '📦 متطلبات الصقل', value: `> ${EMOJI_MORA} مورا: **${userMora.toLocaleString()} / ${reqs.moraCost.toLocaleString()}** ${userMora >= reqs.moraCost ? '✅' : '❌'}\n> ${requiredBook.emoji} ${requiredBook.name}: **${userBookCount} / ${reqs.matCount}** ${userBookCount >= reqs.matCount ? '✅' : '❌'}`, inline: false }
        );

    const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade));
    await i.editReply({ embeds: [embed], components: [menuRow, btnRow] });
}

async function handleSkillUpgrade(i, user, guildId, db, menuRow, skillId) {
    let skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})));
    const currentLevel = Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel);
    const reqs = getUpgradeRequirement(currentLevel);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const requiredBook = upgradeMats.skill_books.find(c => c.category === categoryName).books[reqs.tierIndex];

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [reqs.matCount, user.id, guildId, requiredBook.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [reqs.matCount, user.id, guildId, requiredBook.id]));
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]));
        await db.query('COMMIT').catch(()=>{}); 
        
        await i.editReply({ embeds: [new EmbedBuilder().setTitle(`✨ حكمة جديدة!`).setColor(Colors.LuminousVividPink).setDescription(`المهارة الآن في **Lv.${currentLevel + 1}** 📜`)], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ content: "❌ حدث خطأ!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 🔄 3. فرن الدمج (Synthesis)
// ==========================================
async function buildSynthesisUI(i, user, guildId, db, menuRow, state) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = invRes?.rows || [];

    // سحب العرق الخاص باللاعب عشان نفلتر الخيارات له فقط
    let wRes = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;

    const availableSacrifices = inventory.filter(row => {
        const qty = Number(row.quantity || row.Quantity);
        if (qty < 4) return false;
        const info = getItemInfo(row.itemID || row.itemid);
        if (!info) return false;
        if (info.type === 'material' && info.race !== userRace) return false;
        return true;
    });

    if (availableSacrifices.length === 0) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 عناصر متشابهة من مواد عرقك أو مخطوطات السحر لدمجها.")], components: [menuRow] });

    const sacrificeOptions = availableSacrifices.map(row => {
        const info = getItemInfo(row.itemID || row.itemid);
        return { label: info.name, value: info.id, emoji: info.emoji, description: `تمتلك: ${row.quantity || row.Quantity} | ${info.rarity}` };
    }).slice(0, 25);

    const sacrificeRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به (سيخصم 4)').addOptions(sacrificeOptions));
    const components = [menuRow, sacrificeRow];
    
    let embedDesc = "**فرن الدمج السحري** 🔄\nتستطيع هنا التضحية بـ **4 عناصر متطابقة** للحصول على **عنصر واحد** من اختيارك بنفس الندرة.\n*رسوم الحداد: 5,000 مورا*";
    
    if (state.sacrificeItem) {
        const sacInfo = getItemInfo(state.sacrificeItem);
        embedDesc += `\n\n> 🩸 **العنصر المضحى به:** 4x ${sacInfo.emoji} ${sacInfo.name} (${sacInfo.rarity})`;

        // تحديد العناصر الممكن الحصول عليها (نفس الندرة + تخص عرق اللاعب أو كتب)
        let targetOptions = [];
        const rMats = upgradeMats.weapon_materials.find(m => m.race === userRace);
        if (rMats) {
            const matMatch = rMats.materials.find(m => m.rarity === sacInfo.rarity);
            if (matMatch && matMatch.id !== sacInfo.id) targetOptions.push({ label: matMatch.name, value: matMatch.id, emoji: matMatch.emoji, description: 'مورد سلاح' });
        }
        
        upgradeMats.skill_books.forEach(cat => {
            const bookMatch = cat.books.find(b => b.rarity === sacInfo.rarity);
            if (bookMatch && bookMatch.id !== sacInfo.id) targetOptions.push({ label: bookMatch.name, value: bookMatch.id, emoji: bookMatch.emoji, description: 'مخطوطة سحر' });
        });

        if (targetOptions.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_target').setPlaceholder('2. اختر العنصر المطلوب...').addOptions(targetOptions.slice(0, 25))));
        } else {
            embedDesc += `\n\n⚠️ لا يوجد خيارات دمج متاحة في هذه الندرة لعرقك.`;
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            embedDesc += `\n> ✨ **العنصر المطلوب:** 1x ${targetInfo.emoji} ${targetInfo.name}`;
            components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_synth').setLabel(`دمج (-5000 مورا)`).setStyle(ButtonStyle.Success).setEmoji('🔨')));
        }
    }

    await i.editReply({ embeds: [new EmbedBuilder().setTitle('🔄 فرن الدمج').setColor(Colors.Orange).setDescription(embedDesc)], components });
}

async function handleSynthesis(i, user, guildId, db, menuRow, state) {
    if (!state.sacrificeItem || !state.targetItem) return;
    
    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=>({rows:[]})));
    const sacQty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
    
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;

    if (sacQty < 4) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 حبات من العنصر المطلوب للتضحية.")], components: [menuRow] });
    if (userMora < SYNTHESIS_FEE) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 5,000 مورا لدفع رسوم الحداد.")], components: [menuRow] });

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = "mora" - $1 WHERE "user" = $2 AND "guild" = $3`, [SYNTHESIS_FEE, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = mora - $1 WHERE userid = $2 AND guildid = $3`, [SYNTHESIS_FEE, user.id, guildId]));
        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - 4 WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - 4 WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]));
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        
        let targetCheck = await db.query(`SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.targetItem]).catch(()=> db.query(`SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.targetItem]).catch(()=>({rows:[]})));
        if (targetCheck?.rows?.[0]) await db.query(`UPDATE user_inventory SET "quantity" = "quantity" + 1 WHERE "id" = $1`, [targetCheck.rows[0].id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity + 1 WHERE id = $1`, [targetCheck.rows[0].id || targetCheck.rows[0].ID]));
        else await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]));
        
        await db.query('COMMIT').catch(()=>{}); 
        
        const targetInfo = getItemInfo(state.targetItem);
        const successEmbed = new EmbedBuilder().setTitle(`🔄 عملية دمج ناجحة!`).setColor(Colors.LuminousVividPink).setDescription(`لقد قمت بدمج 4 عناصر وحصلت على:\n✨ **1x ${targetInfo.emoji} ${targetInfo.name}**`);
        await i.editReply({ embeds: [successEmbed], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ content: "❌ حدث خطأ أثناء الدمج!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 🔥 4. محرقة التفكيك (Smelting)
// ==========================================
async function buildSmeltingUI(i, user, guildId, db, menuRow, state) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = invRes?.rows || [];

    const smeltableItems = inventory.filter(row => {
        const info = getItemInfo(row.itemID || row.itemid);
        return info !== null;
    });

    if (smeltableItems.length === 0) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك عناصر قابلة للصهر.")], components: [menuRow] });

    const smeltOptions = smeltableItems.map(row => {
        const info = getItemInfo(row.itemID || row.itemid);
        const xpGain = SMELT_XP_RATES[info.rarity] || 0;
        return { label: info.name, value: info.id, emoji: info.emoji, description: `المخزون: ${row.quantity || row.Quantity} | يعطي: ${xpGain} XP` };
    }).slice(0, 25);

    const smeltRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_smelt_select').setPlaceholder('اختر العنصر الذي تريد صهره...').addOptions(smeltOptions));
    const components = [menuRow, smeltRow];
    
    let embedDesc = "**محرقة التفكيك** 🔥\nهنا يمكنك حرق العناصر التي لا تحتاجها لتحويل طاقاتها السحرية إلى خبرة (XP) مباشرة لشخصيتك.";
    
    if (state.item) {
        const itemInfo = getItemInfo(state.item);
        const xpGain = SMELT_XP_RATES[itemInfo.rarity] || 0;
        embedDesc += `\n\n> 🔥 **الضحية:** 1x ${itemInfo.emoji} ${itemInfo.name}\n> 💡 **النتيجة المتوقعة:** +${xpGain} XP`;
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_smelt').setLabel(`صهر (حبة واحدة)`).setStyle(ButtonStyle.Danger).setEmoji('🔥')));
    }

    await i.editReply({ embeds: [new EmbedBuilder().setTitle('🔥 محرقة التفكيك').setColor(Colors.DarkRed).setDescription(embedDesc)], components });
}

async function handleSmelting(i, user, guildId, db, menuRow, state, client) {
    if (!state.item) return;

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.item]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.item]).catch(()=>({rows:[]})));
    const qty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;

    if (qty < 1) return i.editReply({ embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك هذا العنصر لصهره.")], components: [menuRow] });

    const itemInfo = getItemInfo(state.item);
    const xpReward = SMELT_XP_RATES[itemInfo.rarity] || 10;

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.item]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - 1 WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.item]));
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query('COMMIT').catch(()=>{}); 

        // إضافة الخبرة (XP) بشكل سليم
        const memberObj = await i.guild.members.fetch(user.id).catch(()=>{});
        if (addXPAndCheckLevel && memberObj) {
            await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
        } else {
            await db.query(`UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, [xpReward, user.id, guildId]).catch(()=>{}));
            let cacheData = await client.getLevel(user.id, guildId);
            if(cacheData) { cacheData.xp += xpReward; cacheData.totalXP += xpReward; await client.setLevel(cacheData); }
        }
        
        const successEmbed = new EmbedBuilder().setTitle(`🔥 عملية صهر ناجحة!`).setColor(Colors.Orange).setDescription(`تم حرق ${itemInfo.emoji} ${itemInfo.name} بالكامل.\n✨ لقد اكتسبت **+${xpReward} XP**!`);
        await i.editReply({ embeds: [successEmbed], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ content: "❌ حدث خطأ أثناء الصهر!", embeds: [], components: [menuRow] });
    }
}
