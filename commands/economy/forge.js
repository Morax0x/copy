const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder } = require('discord.js');
const weaponsConfig = require('../../json/weapons-config.json');
const skillsConfig = require('../../json/skills-config.json');
const upgradeMats = require('../../json/upgrade-materials.json');

let generateForgeUI;
try {
    ({ generateForgeUI } = require('../../generators/forge-generator.js'));
} catch (e) {
    generateForgeUI = null;
}

let addXPAndCheckLevel;
try { ({ addXPAndCheckLevel } = require('../handler-utils.js')); } 
catch (e) { try { ({ addXPAndCheckLevel } = require('./handler-utils.js')); } catch (e2) {} }

const EMOJI_MORA = '<:mora:1435647151349698621>';
const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const SMELT_XP_RATES = { 'Common': 10, 'Uncommon': 20, 'Rare': 30, 'Epic': 100, 'Legendary': 1000 };
const SYNTHESIS_FEE = 5000;

// خرائط الصور والموارد
const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'mat_demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

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
        if (mat) {
            const raceFolder = r.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[mat.id] || `${mat.id}.png`;
            return { ...mat, type: 'material', race: r.race, iconUrl: `${R2_URL}/images/materials/${raceFolder}/${imgName}` };
        }
    }
    for (const c of upgradeMats.skill_books) {
        const book = c.books.find(b => b.id === itemId);
        if (book) {
            const typeFolder = c.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[book.id] || `${book.id}.png`;
            return { ...book, type: 'book', iconUrl: `${R2_URL}/images/materials/${typeFolder}/${imgName}` };
        }
    }
    return null;
}

async function replyWithCanvas(i, user, view, data, components) {
    if (generateForgeUI) {
        const buffer = await generateForgeUI(user, view, data);
        if (buffer) {
            const attachment = new AttachmentBuilder(buffer, { name: 'forge.png' });
            return await i.editReply({ embeds: [], components, files: [attachment] }).catch(()=>{});
        }
    }
    // Fallback in case generator fails
    return await i.editReply({ content: "⏳ جاري تحميل الواجهة...", components }).catch(()=>{});
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
        const userMora = Number(userDataRes.rows[0].mora || userDataRes.rows[0].Mora || 0);

        const menuRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId(`forge_menu_main`).setPlaceholder('اختر القسم المطلوب...').addOptions([
                { label: 'ورشة الحدادة (الأسلحة)', value: 'weapon', emoji: '⚒️', description: 'استخدم الخامات لترقية سلاحك العرقي' },
                { label: 'أكاديمية السحر (المهارات)', value: 'skill_menu', emoji: '📜', description: 'استخدم المخطوطات لصقل مهاراتك' },
                { label: 'فرن الدمج (استبدال العناصر)', value: 'synthesis', emoji: '🔄', description: 'ادمج 4 عناصر لتحصل على عنصر من اختيارك' },
                { label: 'محرقة التفكيك (صهر للخبرة)', value: 'smelting', emoji: '🔥', description: 'احرق العناصر الزائدة مقابل XP' }
            ])
        );

        let replyObj = await (isSlash ? interactionOrMessage.editReply({ content: "⏳ جاري تحضير المجمع..." }) : interactionOrMessage.reply({ content: "⏳ جاري تحضير المجمع..." }));
        await replyWithCanvas(isSlash ? interactionOrMessage : { editReply: (p) => replyObj.edit(p) }, user, 'main', { mora: userMora, title: 'المجمع الإمبراطوري للتطوير' }, [menuRow]);

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
    if (!wData) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي سلاح! احصل على رتبة عرق أولاً.")], components: [menuRow] });

    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    
    if (currentLevel >= 30) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ سلاحك وصل للحد الأقصى (Lv.30)!`)], components: [menuRow] });

    const reqs = getUpgradeRequirement(currentLevel);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));
    const requiredMaterial = getItemInfo(raceMats.materials[reqs.tierIndex].id);

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredMaterial.id]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredMaterial.id]).catch(()=>({rows:[]})));
    const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    const canUpgrade = userMora >= reqs.moraCost && userMatCount >= reqs.matCount;
    const currentDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
    const nextDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);

    const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تطوير السلاح 🔨').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade));
    
    await replyWithCanvas(i, user, 'weapon', {
        mora: userMora, title: `تطوير ${weaponConfig.name}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentDmg} DMG`, nextStat: `${nextDmg} DMG`,
        reqMora: reqs.moraCost, reqMatName: requiredMaterial.name, reqMatIcon: requiredMaterial.iconUrl,
        userMatCount, reqMatCount: reqs.matCount
    }, [menuRow, btnRow]);
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
        
        await i.editReply({ files: [], embeds: [new EmbedBuilder().setTitle(`✨ نجاح التطوير!`).setColor(Colors.LuminousVividPink).setDescription(`سلاحك الآن في **Lv.${currentLevel + 1}** ⚔️`)], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 📜 2. أكاديمية السحر (صقل المهارات)
// ==========================================
async function buildAcademyMenuUI(i, user, guildId, db, menuRow) {
    let skillsRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userSkills = skillsRes?.rows || [];

    if (userSkills.length === 0) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي مهارات لتصقلها!")], components: [menuRow] });

    const skillOptions = userSkills.map(s => {
        const configSkill = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
        return configSkill ? { label: configSkill.name, value: configSkill.id, emoji: configSkill.emoji, description: `Lv.${s.skillLevel || s.skilllevel}` } : null;
    }).filter(Boolean);

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر المهارة...').addOptions(skillOptions.slice(0, 25)));
    
    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    await replyWithCanvas(i, user, 'main', { mora: userMora, title: 'أكاديمية السحر' }, [menuRow, skillSelectRow]);
}

async function buildSkillUpgradeUI(i, user, guildId, db, menuRow, skillId) {
    let skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})));
    const sData = skillRes?.rows?.[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    
    if (currentLevel >= (configSkill.max_level || 30)) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ مهارة **${configSkill.name}** وصلت للحد الأقصى!`)], components: [menuRow] });

    const reqs = getUpgradeRequirement(currentLevel);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const requiredBookRaw = upgradeMats.skill_books.find(c => c.category === categoryName).books[reqs.tierIndex];
    const requiredBook = getItemInfo(requiredBookRaw.id);

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, requiredBook.id]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, requiredBook.id]).catch(()=>({rows:[]})));
    const userBookCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity) : 0;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    const canUpgrade = userMora >= reqs.moraCost && userBookCount >= reqs.matCount;
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    const currentVal = configSkill.base_value + (configSkill.value_increment * (currentLevel - 1));
    const nextVal = configSkill.base_value + (configSkill.value_increment * currentLevel);

    const btnRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade));
    
    await replyWithCanvas(i, user, 'skill', {
        mora: userMora, title: `صقل ${configSkill.name}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentVal}${statSymbol}`, nextStat: `${nextVal}${statSymbol}`,
        reqMora: reqs.moraCost, reqMatName: requiredBook.name, reqMatIcon: requiredBook.iconUrl,
        userMatCount: userBookCount, reqMatCount: reqs.matCount
    }, [menuRow, btnRow]);
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
        
        await i.editReply({ files: [], embeds: [new EmbedBuilder().setTitle(`✨ حكمة جديدة!`).setColor(Colors.LuminousVividPink).setDescription(`المهارة الآن في **Lv.${currentLevel + 1}** 📜`)], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 🔄 3. فرن الدمج (Synthesis)
// ==========================================
async function buildSynthesisUI(i, user, guildId, db, menuRow, state) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = invRes?.rows || [];

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

    if (availableSacrifices.length === 0) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 عناصر متشابهة من مواد عرقك أو مخطوطات السحر لدمجها.")], components: [menuRow] });

    const sacrificeOptions = availableSacrifices.map(row => {
        const info = getItemInfo(row.itemID || row.itemid);
        return { label: info.name, value: info.id, emoji: info.emoji, description: `تمتلك: ${row.quantity || row.Quantity} | ${info.rarity}` };
    }).slice(0, 25);

    const sacrificeRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به (سيخصم 4)').addOptions(sacrificeOptions));
    const components = [menuRow, sacrificeRow];
    
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;

    let payloadData = { mora: userMora, title: 'فرن الدمج السحري', fee: SYNTHESIS_FEE };

    if (state.sacrificeItem) {
        const sacInfo = getItemInfo(state.sacrificeItem);
        payloadData.sacMatName = sacInfo.name;
        payloadData.reqMatIcon = sacInfo.iconUrl;

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
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            payloadData.targetMatName = targetInfo.name;
            payloadData.targetMatIcon = targetInfo.iconUrl;
            components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_synth').setLabel(`دمج (-5000 مورا)`).setStyle(ButtonStyle.Success).setEmoji('🔨')));
        }
    }

    await replyWithCanvas(i, user, 'synthesis', payloadData, components);
}

async function handleSynthesis(i, user, guildId, db, menuRow, state) {
    if (!state.sacrificeItem || !state.targetItem) return;
    
    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=>({rows:[]})));
    const sacQty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
    
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;

    if (sacQty < 4) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 حبات من العنصر المطلوب للتضحية.")], components: [menuRow] });
    if (userMora < SYNTHESIS_FEE) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 5,000 مورا لدفع رسوم الحداد.")], components: [menuRow] });

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
        await i.editReply({ files: [], embeds: [successEmbed], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ أثناء الدمج!", embeds: [], components: [menuRow] });
    }
}

// ==========================================
// 🔥 4. محرقة التفكيك (Smelting)
// ==========================================
async function buildSmeltingUI(i, user, guildId, db, menuRow, state) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = invRes?.rows || [];

    const smeltableItems = inventory.filter(row => getItemInfo(row.itemID || row.itemid) !== null);

    if (smeltableItems.length === 0) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك عناصر قابلة للصهر.")], components: [menuRow] });

    const smeltOptions = smeltableItems.map(row => {
        const info = getItemInfo(row.itemID || row.itemid);
        const xpGain = SMELT_XP_RATES[info.rarity] || 0;
        return { label: info.name, value: info.id, emoji: info.emoji, description: `المخزون: ${row.quantity || row.Quantity} | يعطي: ${xpGain} XP` };
    }).slice(0, 25);

    const smeltRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_smelt_select').setPlaceholder('اختر العنصر الذي تريد صهره...').addOptions(smeltOptions));
    const components = [menuRow, smeltRow];
    
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;

    let payloadData = { mora: userMora, title: 'محرقة التفكيك' };

    if (state.item) {
        const itemInfo = getItemInfo(state.item);
        payloadData.sacMatName = itemInfo.name;
        payloadData.reqMatIcon = itemInfo.iconUrl;
        payloadData.xpGain = SMELT_XP_RATES[itemInfo.rarity] || 10;
        components.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('forge_execute_smelt').setLabel(`صهر (حبة واحدة)`).setStyle(ButtonStyle.Danger).setEmoji('🔥')));
    }

    await replyWithCanvas(i, user, 'smelting', payloadData, components);
}

async function handleSmelting(i, user, guildId, db, menuRow, state, client) {
    if (!state.item) return;

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.item]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.item]).catch(()=>({rows:[]})));
    const qty = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;

    if (qty < 1) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك هذا العنصر لصهره.")], components: [menuRow] });

    const itemInfo = getItemInfo(state.item);
    const xpReward = SMELT_XP_RATES[itemInfo.rarity] || 10;

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - 1 WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.item]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - 1 WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.item]));
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query('COMMIT').catch(()=>{}); 

        const memberObj = await i.guild.members.fetch(user.id).catch(()=>{});
        if (addXPAndCheckLevel && memberObj) {
            await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
        } else {
            await db.query(`UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, [xpReward, user.id, guildId]).catch(()=>{}));
            let cacheData = await client.getLevel(user.id, guildId);
            if(cacheData) { cacheData.xp += xpReward; cacheData.totalXP += xpReward; await client.setLevel(cacheData); }
        }
        
        const successEmbed = new EmbedBuilder().setTitle(`🔥 عملية صهر ناجحة!`).setColor(Colors.Orange).setDescription(`تم حرق ${itemInfo.emoji} ${itemInfo.name} بالكامل.\n✨ لقد اكتسبت **+${xpReward} XP**!`);
        await i.editReply({ files: [], embeds: [successEmbed], components: [menuRow] });
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ أثناء الصهر!", embeds: [], components: [menuRow] });
    }
}
