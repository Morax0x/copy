const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, Colors, AttachmentBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
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

const R2_URL = 'https://pub-d042f26f54cd4b60889caff0b496a614.r2.dev';
const SMELT_XP_RATES = { 'Common': 10, 'Uncommon': 20, 'Rare': 30, 'Epic': 100, 'Legendary': 1000 };
const SYNTHESIS_FEE = 999;

const ID_TO_IMAGE = {
    'mat_dragon_1': 'dragon_ash.png', 'mat_dragon_2': 'dragon_scale.png', 'mat_dragon_3': 'dragon_claw.png', 'mat_dragon_4': 'dragon_heart.png', 'mat_dragon_5': 'dragon_core.png',
    'mat_human_1': 'human_iron.png', 'mat_human_2': 'human_steel.png', 'mat_human_3': 'human_meteor.png', 'mat_human_4': 'human_seal.png', 'mat_human_5': 'human_crown.png',
    'mat_elf_1': 'elf_branch.png', 'mat_elf_2': 'elf_bark.png', 'mat_elf_3': 'elf_flower.png', 'mat_elf_4': 'elf_crystal.png', 'mat_elf_5': 'elf_tear.png',
    'mat_darkelf_1': 'darkelf_obsidian.png', 'mat_darkelf_2': 'darkelf_glass.png', 'mat_darkelf_3': 'darkelf_crystal.png', 'mat_darkelf_4': 'darkelf_void.png', 'mat_darkelf_5': 'darkelf_ash.png',
    'mat_seraphim_1': 'seraphim_feathe.png', 'mat_seraphim_2': 'seraphim_halo.png', 'mat_seraphim_3': 'seraphim_crystal.png', 'mat_seraphim_4': 'seraphim_core.png', 'mat_seraphim_5': 'seraphim_chalice.png',
    'demon_1': 'demon_ember.png', 'mat_demon_2': 'demon_horn.png', 'mat_demon_3': 'demon_crystal.png', 'mat_demon_4': 'demon_flame.png', 'mat_demon_5': 'demon_crown.png',
    'mat_vampire_1': 'vampire_blood.png', 'mat_vampire_2': 'vampire_vial.png', 'mat_vampire_3': 'vampire_fang.png', 'mat_vampire_4': 'vampire_moon.png', 'mat_vampire_5': 'vampire_chalice.png',
    'mat_spirit_1': 'spirit_dust.png', 'mat_spirit_2': 'spirit_remnant.png', 'mat_spirit_3': 'spirit_crystal.png', 'mat_spirit_4': 'spirit_core.png', 'mat_spirit_5': 'spirit_pulse.png',
    'mat_hybrid_1': 'hybrid_claw.png', 'mat_hybrid_2': 'hybrid_fur.png', 'mat_hybrid_3': 'hybrid_bone.png', 'mat_hybrid_4': 'hybrid_crystal.png', 'mat_hybrid_5': 'hybrid_soul.png',
    'mat_dwarf_1': 'dwarf_copper.png', 'mat_dwarf_2': 'dwarf_bronze.png', 'mat_dwarf_3': 'dwarf_mithril.png', 'mat_dwarf_4': 'dwarf_heart.png', 'mat_dwarf_5': 'dwarf_hammer.png',
    'mat_ghoul_1': 'ghoul_bone.png', 'mat_ghoul_2': 'ghoul_remains.png', 'mat_ghoul_3': 'ghoul_skull.png', 'mat_ghoul_4': 'ghoul_crystal.png', 'mat_ghoul_5': 'ghoul_core.png',
    'book_general_1': 'gen_book_tactic.png', 'book_general_2': 'gen_book_combat.png', 'book_general_3': 'gen_book_arts.png', 'book_general_4': 'gen_book_war.png', 'book_general_5': 'gen_book_wisdom.png',
    'book_race_1': 'race_book_stone.png', 'book_race_2': 'race_book_ancestor.png', 'book_race_3': 'race_book_secrets.png', 'book_race_4': 'race_book_covenant.png', 'book_race_5': 'race_book_pact.png'
};

const RARITY_ARABIC = {
    'Common': 'شائع',
    'Uncommon': 'شائع',
    'Rare': 'نادر',
    'Epic': 'ملحمي',
    'Legendary': 'أسطوري'
};

function translateRarity(rarity) {
    return RARITY_ARABIC[rarity] || rarity;
}

function resolveText(val) {
    if (val == null) return '';
    if (typeof val === 'object') return val.ar || val.en || val.name || JSON.stringify(val);
    return String(val);
}

function getUpgradeRequirements(currentLevel, isSkill = false) {
    if (currentLevel >= 30) return null;

    let reqs = [];
    let moraCost = 0;

    const currentTier = Math.floor((currentLevel - 1) / 5); 
    const primaryTier = Math.min(currentTier, 4);

    moraCost = currentLevel * 1500 * (primaryTier + 1);

    if (primaryTier === 0) {
        reqs.push({ tier: 0, count: Math.floor(currentLevel * 1.5) + 2 });
    } else {
        const prevTier = primaryTier - 1;
        reqs.push({ tier: prevTier, count: Math.floor(currentLevel * 2.5) + 5 });
        reqs.push({ tier: primaryTier, count: Math.floor(currentLevel * 1.2) + 2 });
    }

    let finalReqs = [];
    for (let r of reqs) {
        if (!isSkill) {
            finalReqs.push({ type: 'material', tier: r.tier, count: r.count });
        } else {
            finalReqs.push({ type: 'book', tier: r.tier, count: r.count });
            finalReqs.push({ type: 'material', tier: r.tier, count: Math.max(1, Math.floor(r.count * 0.6)) });
        }
    }

    return { moraCost, materials: finalReqs };
}

function getItemInfo(itemId) {
    if(!itemId) return null;
    for (const r of upgradeMats.weapon_materials) {
        const mat = r.materials.find(m => m.id === itemId);
        if (mat) {
            const raceFolder = r.race.toLowerCase().replace(' ', '_');
            const imgName = ID_TO_IMAGE[mat.id] || `${mat.id}.png`;
            return { ...mat, type: 'material', race: r.race, name: resolveText(mat.name), iconUrl: `${R2_URL}/images/materials/${raceFolder}/${imgName}`, rarity: mat.rarity };
        }
    }
    for (const c of upgradeMats.skill_books) {
        const book = c.books.find(b => b.id === itemId);
        if (book) {
            const typeFolder = c.category === 'General_Skills' ? 'general' : 'race';
            const imgName = ID_TO_IMAGE[book.id] || `${book.id}.png`;
            return { ...book, type: 'book', name: resolveText(book.name), iconUrl: `${R2_URL}/images/materials/${typeFolder}/${imgName}`, rarity: book.rarity };
        }
    }
    return null;
}

function aggregateInventory(rows) {
    const map = {};
    for (const r of rows) {
        const id = r.itemID || r.itemid;
        const qty = Number(r.quantity || r.Quantity);
        if (!map[id]) map[id] = 0;
        map[id] += qty;
    }
    return Object.keys(map).map(id => ({ itemID: id, quantity: map[id] }));
}

const getMainMenuRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('forge_skill_menu').setLabel('الاكادمـيـة').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('forge_weapon').setLabel('الحـدادة').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('forge_synthesis').setLabel('فـرن الـدمـج').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('forge_smelting').setLabel('المـصـهـر').setStyle(ButtonStyle.Danger)
);

const getReturnRow = () => new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('forge_return_main').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
);

async function replyWithCanvas(i, user, view, data, components, customEmbeds = [], isInitial = false) {
    let returnMessage = null;
    try {
        if (generateForgeUI) {
            const buffer = await generateForgeUI(user, view, data);
            if (buffer) {
                const filename = `forge_${Date.now()}.png`; 
                const attachment = new AttachmentBuilder(buffer, { name: filename });
                
                if (isInitial && typeof i.reply === 'function' && !i.replied && !i.deferred) {
                    returnMessage = await i.reply({ content: null, embeds: customEmbeds, components, files: [attachment], fetchReply: true }).catch(()=>{});
                    return returnMessage || i; 
                } else {
                    returnMessage = await i.editReply({ content: null, embeds: customEmbeds, components, files: [attachment] }).catch(()=>{});
                    return returnMessage || i;
                }
            }
        }
    } catch (e) {
        console.error("Canvas Error in Forge:", e);
        await i.followUp({ content: `❌ خطأ في رسم الصورة: \`${e.message}\``, flags: MessageFlags.Ephemeral }).catch(()=>{});
    }
    
    try {
        if (isInitial && typeof i.reply === 'function' && !i.replied && !i.deferred) {
            returnMessage = await i.reply({ content: "⏳ النظام يعمل في الخلفية...", components, embeds: customEmbeds, fetchReply: true }).catch(()=>{});
        } else {
            returnMessage = await i.editReply({ content: null, components, embeds: customEmbeds, files: [] }).catch(()=>{});
        }
    } catch(err) {}
    
    return returnMessage || i;
}

async function buildMainUI(i, user, guildId, db, isInitial = false) {
    let userDataRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = Number(userDataRes?.rows?.[0]?.mora || userDataRes?.rows?.[0]?.Mora || 0);
    return await replyWithCanvas(i, user, 'main', { mora: userMora, title: 'المجمع الإمبراطوري للتطوير' }, [getMainMenuRow()], [], isInitial);
}

module.exports = {
    data: new SlashCommandBuilder().setName('حدادة').setDescription('الدخول إلى المجمع الإمبراطوري لتطوير الأسلحة وصقل المهارات'),
    name: 'حدادة',
    aliases: ['forge', 'تطوير', 'صقل', 'دمج', 'صهر', 'حداده'],
    category: 'Economy',
    
    async execute(interactionOrMessage) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        const client = interactionOrMessage.client;
        const db = client.sql;
        const user = isSlash ? interactionOrMessage.user : interactionOrMessage.author;
        const guildId = interactionOrMessage.guild.id;

        // 🔥 استخراج اسم الأمر أو الاختصار (يشتغل حتى بالكازينو بدون بريفكس) 🔥
        let commandTrigger = "";
        if (!isSlash) {
            commandTrigger = interactionOrMessage.content.trim().split(/ +/)[0].toLowerCase().replace(/^[^\w\s\u0600-\u06FF]/, ''); 
        } else {
            commandTrigger = interactionOrMessage.commandName;
        }

        let userDataRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
        if (!userDataRes?.rows?.[0]) {
            return isSlash ? interactionOrMessage.reply("❌ لم يتم العثور على بياناتك.") : interactionOrMessage.channel.send("❌ لم يتم العثور على بياناتك.");
        }

        let synthesisState = { sacrificeItem: null, targetItem: null };
        let smeltState = { item: null };
        
        let sentMsg = null;
        const fakeInteraction = isSlash ? interactionOrMessage : {
            replied: false, deferred: false,
            reply: async (p) => { p.fetchReply = true; sentMsg = await interactionOrMessage.reply(p); return sentMsg; },
            editReply: async (p) => { if(sentMsg) return await sentMsg.edit(p); else return await interactionOrMessage.reply(p); },
            followUp: async (p) => interactionOrMessage.channel.send(p)
        };

        if (isSlash) await fakeInteraction.deferReply();

        let replyObj;

        // 🔥 التوجيه الذكي المباشر من الكلمات 🔥
        if (commandTrigger.includes('صقل') || commandTrigger === 'ms') {
            replyObj = await buildAcademyMenuUI(fakeInteraction, user, guildId, db, !isSlash);
        } else if (commandTrigger.includes('دمج')) {
            replyObj = await buildSynthesisUI(fakeInteraction, user, guildId, db, synthesisState, !isSlash);
        } else if (commandTrigger.includes('صهر')) {
            replyObj = await buildSmeltingUI(fakeInteraction, user, guildId, db, smeltState, !isSlash);
        } else {
            // حدادة، حداده، تطوير، forge
            replyObj = await buildMainUI(fakeInteraction, user, guildId, db, !isSlash);
        }

        if (isSlash && !replyObj?.createMessageComponentCollector) {
            replyObj = await interactionOrMessage.fetchReply().catch(()=>{});
        }
        
        if (!replyObj || !replyObj.createMessageComponentCollector) return;

        const filter = i => i.user.id === user.id && i.customId.startsWith('forge_');
        const collector = replyObj.createMessageComponentCollector({ filter, time: 300000 });

        collector.on('collect', async (i) => {
            try { 
                if (!i.customId.startsWith('forge_smelt_multi_') && !i.deferred && !i.replied) await i.deferUpdate(); 
            } catch(e) {}

            try {
                if (i.customId === 'forge_return_main') {
                    synthesisState = { sacrificeItem: null, targetItem: null };
                    smeltState = { item: null };
                    await buildMainUI(i, user, guildId, db, false);
                }
                else if (i.isStringSelectMenu()) {
                    if (i.customId === 'forge_skill_select') {
                        await buildSkillUpgradeUI(i, user, guildId, db, i.values[0]);
                    }
                    else if (i.customId === 'forge_synth_sacrifice') {
                        synthesisState.sacrificeItem = i.values[0];
                        synthesisState.targetItem = null; 
                        await buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_synth_target') {
                        synthesisState.targetItem = i.values[0];
                        await buildSynthesisUI(i, user, guildId, db, synthesisState);
                    }
                    else if (i.customId === 'forge_smelt_select') {
                        smeltState.item = i.values[0];
                        await buildSmeltingUI(i, user, guildId, db, smeltState);
                    }
                }
                else if (i.isButton()) {
                    if (i.customId === 'forge_weapon') await buildWeaponForgeUI(i, user, guildId, db);
                    else if (i.customId === 'forge_skill_menu') await buildAcademyMenuUI(i, user, guildId, db);
                    else if (i.customId === 'forge_synthesis') { 
                        synthesisState = { sacrificeItem: null, targetItem: null }; 
                        await buildSynthesisUI(i, user, guildId, db, synthesisState); 
                    }
                    else if (i.customId === 'forge_smelting') { 
                        smeltState = { item: null }; 
                        await buildSmeltingUI(i, user, guildId, db, smeltState); 
                    }
                    
                    else if (i.customId === 'forge_upgrade_weapon') await handleWeaponUpgrade(i, user, guildId, db);
                    else if (i.customId.startsWith('forge_upgrade_skill_')) await handleSkillUpgrade(i, user, guildId, db, i.customId.replace('forge_upgrade_skill_', ''));
                    else if (i.customId === 'forge_execute_synth') {
                        await handleSynthesis(i, user, guildId, db, synthesisState);
                        synthesisState = { sacrificeItem: null, targetItem: null };
                    }
                    else if (i.customId === 'forge_execute_smelt_1') {
                        await handleSmelting(i, user, guildId, db, smeltState, client, 1);
                        smeltState = { item: null };
                    }
                    else if (i.customId.startsWith('forge_smelt_multi_')) {
                        await handleSmeltingMultiModal(i, user, guildId, db, smeltState, client);
                    }
                }
            } catch (innerError) {
                console.error("Collector Action Error:", innerError);
                await i.followUp({ content: `❌ **خطأ برمجي:**\n\`${innerError.message}\``, flags: MessageFlags.Ephemeral }).catch(()=>{});
            }
        });

        collector.on('end', () => {
            try { 
                const disabledRow = getMainMenuRow();
                disabledRow.components.forEach(c => c.setDisabled(true)); 
                replyObj.edit({ components: [disabledRow] }).catch(()=>{}); 
            } catch(e) {}
        });
    }
};

// ------------------- السلاح -------------------
async function buildWeaponForgeUI(i, user, guildId, db) {
    let weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const wData = weaponRes?.rows?.[0];
    if (!wData) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي سلاح! احصل على رتبة عرق أولاً.")], components: [getReturnRow()] });

    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    
    if (currentLevel >= 30) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ سلاحك وصل للحد الأقصى (Lv.30)!`)], components: [getReturnRow()] });

    let lvlRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) {
        return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ **قفل المستوى:** يجب أن تصل إلى **المستوى 30** في السيرفر لتتمكن من تطوير عتادك فوق المستوى 15.")], components: [getReturnRow()] });
    }

    const reqs = getUpgradeRequirements(currentLevel, false);
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));
    
    let detailedReqs = [];
    let hasAllMats = true;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    for (let r of reqs.materials) {
        let matId = raceMats.materials[r.tier].id;
        let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, matId]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, matId]).catch(()=>({rows:[]})));
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        
        let matInfo = getItemInfo(matId);
        if (userMatCount < r.count) hasAllMats = false;
        
        detailedReqs.push({ 
            id: matId, count: r.count, userCount: userMatCount,
            name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl
        });
    }

    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;
    const currentDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * (currentLevel - 1));
    const nextDmg = weaponConfig.base_damage + (weaponConfig.damage_increment * currentLevel);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_weapon`).setLabel('تـطـويـر السـلاح').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    return await replyWithCanvas(i, user, 'weapon', {
        mora: userMora, title: `تطوير ${resolveText(weaponConfig.name)}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentDmg} DMG`, nextStat: `${nextDmg} DMG`,
        reqMora: reqs.moraCost, detailedReqs: detailedReqs 
    }, [btnRow], []);
}

async function handleWeaponUpgrade(i, user, guildId, db) {
    let weaponRes = await db.query(`SELECT "raceName", "weaponLevel" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename, weaponlevel FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const wData = weaponRes?.rows?.[0];
    const currentLevel = Number(wData.weaponLevel || wData.weaponlevel);
    
    let lvlRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, false);
    const weaponConfig = weaponsConfig.find(w => w.race === (wData.raceName || wData.racename));
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === (wData.raceName || wData.racename));

    let detailedReqs = reqs.materials.map(r => ({ id: raceMats.materials[r.tier].id, count: r.count }));

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        
        for (let r of detailedReqs) {
            await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(CAST("quantity" AS INTEGER) - $1, 0) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [r.count, user.id, guildId, r.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = MAX(CAST(quantity AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [r.count, user.id, guildId, r.id]));
        }
        
        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_weapons SET "weaponLevel" = "weaponLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "raceName" = $3`, [user.id, guildId, wData.raceName || wData.racename]).catch(()=> db.query(`UPDATE user_weapons SET weaponlevel = weaponlevel + 1 WHERE userid = $1 AND guildid = $2 AND racename = $3`, [user.id, guildId, wData.raceName || wData.racename]));
        await db.query('COMMIT').catch(()=>{}); 
        
        const nextLevel = currentLevel + 1;
        const nextStat = `${weaponConfig.base_damage + (weaponConfig.damage_increment * nextLevel)} DMG`;

        await replyWithCanvas(i, user, 'success_weapon', {
            title: `تطوير ${resolveText(weaponConfig.name)}`,
            currentLevel: currentLevel,
            nextLevel: nextLevel,
            nextStat: nextStat
        }, [getReturnRow()], []);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ أثناء الحفظ!", embeds: [], components: [getReturnRow()] });
    }
}

// ------------------- المهارات -------------------
async function buildAcademyMenuUI(i, user, guildId, db, isInitial = false) {
    let skillsRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userSkills = skillsRes?.rows || [];

    if (userSkills.length === 0) return replyWithCanvas(i, user, 'main', { title: 'أكاديمية السحر السري' }, [getReturnRow()], [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ أنت لا تملك أي مهارات لتصقلها!")], isInitial);

    const skillOptions = userSkills.map(s => {
        const configSkill = skillsConfig.find(sc => sc.id === (s.skillID || s.skillid));
        if (!configSkill) return null;
        return { label: resolveText(configSkill.name).substring(0, 100), value: configSkill.id.substring(0, 100), description: `Lv.${s.skillLevel || s.skilllevel}`.substring(0, 100) };
    }).filter(Boolean);

    if(skillOptions.length === 0) return replyWithCanvas(i, user, 'main', { title: 'أكاديمية السحر السري' }, [getReturnRow()], [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا يمكن جلب بيانات المهارات حالياً.")], isInitial);

    const skillSelectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_skill_select').setPlaceholder('اختر المهارة...').addOptions(skillOptions.slice(0, 25)));
    
    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    return await replyWithCanvas(i, user, 'skill_home', { mora: userMora, title: 'أكاديمية السحر السري' }, [skillSelectRow, getReturnRow()], [], isInitial);
}

async function buildSkillUpgradeUI(i, user, guildId, db, skillId) {
    let skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})));
    const sData = skillRes?.rows?.[0];
    const currentLevel = Number(sData.skillLevel || sData.skilllevel);
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    
    if (currentLevel >= (configSkill.max_level || 30)) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Gold).setDescription(`✨ المهارة وصلت للحد الأقصى!`)], components: [getReturnRow()] });

    let lvlRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) {
        return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ **قفل المستوى:** يجب أن تصل إلى **المستوى 30** في السيرفر لتتمكن من صقل المهارات فوق المستوى 15.")], components: [getReturnRow()] });
    }

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    
    let wRes = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === userRace);

    let detailedReqs = [];
    let hasAllMats = true;

    let userMoraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = userMoraRes?.rows?.[0] ? Number(userMoraRes.rows[0].mora) : 0;

    for (let r of reqs.materials) {
        let itemId = r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id;
        let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, itemId]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, itemId]).catch(()=>({rows:[]})));
        const userMatCount = invRes?.rows?.[0] ? Number(invRes.rows[0].quantity || invRes.rows[0].Quantity) : 0;
        
        let matInfo = getItemInfo(itemId);
        if (userMatCount < r.count) hasAllMats = false;
        
        detailedReqs.push({ 
            id: itemId, count: r.count, userCount: userMatCount,
            name: matInfo.name, rarity: matInfo.rarity, iconUrl: matInfo.iconUrl
        });
    }

    const canUpgrade = userMora >= reqs.moraCost && hasAllMats;
    const statSymbol = configSkill.stat_type === '%' ? '%' : '';
    const currentVal = configSkill.base_value + (configSkill.value_increment * (currentLevel - 1));
    const nextVal = configSkill.base_value + (configSkill.value_increment * currentLevel);

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`forge_upgrade_skill_${skillId}`).setLabel('صقل المهارة 📜').setStyle(canUpgrade ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(!canUpgrade),
        getReturnRow().components[0]
    );
    
    await replyWithCanvas(i, user, 'skill', {
        mora: userMora, title: `صقل ${resolveText(configSkill.name)}`,
        currentLevel, nextLevel: currentLevel + 1,
        currentStat: `${currentVal}${statSymbol}`, nextStat: `${nextVal}${statSymbol}`,
        reqMora: reqs.moraCost, detailedReqs: detailedReqs
    }, [btnRow], []);
}

async function handleSkillUpgrade(i, user, guildId, db, skillId) {
    let skillRes = await db.query(`SELECT * FROM user_skills WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`SELECT * FROM user_skills WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]).catch(()=>({rows:[]})));
    const currentLevel = Number(skillRes.rows[0].skillLevel || skillRes.rows[0].skilllevel);
    
    let lvlRes = await db.query(`SELECT "level" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT level FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const playerServerLevel = Number(lvlRes?.rows?.[0]?.level || lvlRes?.rows?.[0]?.Level || 1);
    if (currentLevel >= 15 && playerServerLevel < 30) return; 

    const reqs = getUpgradeRequirements(currentLevel, true);
    const categoryName = skillId.startsWith('race_') ? 'Race_Skills' : 'General_Skills';
    const configSkill = skillsConfig.find(sc => sc.id === skillId);
    const bookCat = upgradeMats.skill_books.find(c => c.category === categoryName);
    
    let wRes = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;
    const raceMats = upgradeMats.weapon_materials.find(m => m.race === userRace);

    let detailedReqs = [];
    for (let r of reqs.materials) {
        let itemId = r.type === 'book' ? bookCat.books[r.tier].id : raceMats.materials[r.tier].id;
        detailedReqs.push({ id: itemId, count: r.count });
    }

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [reqs.moraCost, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [reqs.moraCost, user.id, guildId]));
        
        for (let r of detailedReqs) {
            await db.query(`UPDATE user_inventory SET "quantity" = GREATEST(CAST("quantity" AS INTEGER) - $1, 0) WHERE "userID" = $2 AND "guildID" = $3 AND "itemID" = $4`, [r.count, user.id, guildId, r.id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = MAX(CAST(quantity AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3 AND itemid = $4`, [r.count, user.id, guildId, r.id]));
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query(`UPDATE user_skills SET "skillLevel" = "skillLevel" + 1 WHERE "userID" = $1 AND "guildID" = $2 AND "skillID" = $3`, [user.id, guildId, skillId]).catch(()=> db.query(`UPDATE user_skills SET skilllevel = skilllevel + 1 WHERE userid = $1 AND guildid = $2 AND skillid = $3`, [user.id, guildId, skillId]));
        await db.query('COMMIT').catch(()=>{}); 
        
        const nextLevel = currentLevel + 1;
        const statSymbol = configSkill.stat_type === '%' ? '%' : '';
        const nextStat = `${configSkill.base_value + (configSkill.value_increment * nextLevel)}${statSymbol}`;

        await replyWithCanvas(i, user, 'success_skill', {
            title: `صقل ${resolveText(configSkill.name)}`,
            currentLevel: currentLevel,
            nextLevel: nextLevel,
            nextStat: nextStat
        }, [getReturnRow()], []);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ أثناء الحفظ!", embeds: [], components: [getReturnRow()] });
    }
}

// ------------------- الدمج (Synthesis) -------------------
async function buildSynthesisUI(i, user, guildId, db, state, isInitial = false) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = aggregateInventory(invRes?.rows || []);

    let wRes = await db.query(`SELECT "raceName" FROM user_weapons WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT racename FROM user_weapons WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userRace = wRes?.rows?.[0]?.raceName || wRes?.rows?.[0]?.racename;

    const availableSacrifices = inventory.filter(row => {
        if (row.quantity < 4) return false;
        const info = getItemInfo(row.itemID);
        if (!info) return false;
        if (info.type === 'material' && info.race !== userRace) return false;
        return true;
    });

    if (availableSacrifices.length === 0) return replyWithCanvas(i, user, 'main', { title: 'فرن الدمج الكيميائي' }, [getReturnRow()], [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 عناصر متشابهة من مواد عرقك أو مخطوطات السحر لدمجها.")], isInitial);

    let components = [];
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;
    
    let payloadData = { mora: userMora, title: 'فرن الدمج السحري', fee: SYNTHESIS_FEE };

    if (!state.sacrificeItem) {
        const sacrificeOptions = availableSacrifices.map(row => {
            const info = getItemInfo(row.itemID);
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `الكمية: ${row.quantity} | الندرة: ${translateRarity(info.rarity)}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_sacrifice').setPlaceholder('1. اختر العنصر الذي ستضحي به (سيخصم 4)').addOptions(sacrificeOptions)));
    } else {
        const sacInfo = getItemInfo(state.sacrificeItem);
        if(!sacInfo) { state.sacrificeItem = null; return buildSynthesisUI(i, user, guildId, db, state, isInitial); } // حماية ضد الأخطاء

        payloadData.sacMatName = sacInfo.name;
        payloadData.reqMatIcon = sacInfo.iconUrl;

        let targetOptions = [];
        const rMats = upgradeMats.weapon_materials.find(m => m.race === userRace);
        if (rMats) {
            const matMatch = rMats.materials.find(m => m.rarity === sacInfo.rarity);
            if (matMatch && matMatch.id !== sacInfo.id) {
                targetOptions.push({ label: resolveText(matMatch.name).substring(0, 100), value: matMatch.id.substring(0, 100), description: 'مورد سلاح' });
            }
        }
        
        upgradeMats.skill_books.forEach(cat => {
            const bookMatch = cat.books.find(b => b.rarity === sacInfo.rarity);
            if (bookMatch && bookMatch.id !== sacInfo.id) {
                targetOptions.push({ label: resolveText(bookMatch.name).substring(0, 100), value: bookMatch.id.substring(0, 100), description: 'مخطوطة سحر' });
            }
        });

        const uniqueTargetsMap = new Map();
        targetOptions.forEach(opt => uniqueTargetsMap.set(opt.value, opt));
        const uniqueTargets = Array.from(uniqueTargetsMap.values());

        if (!state.targetItem && uniqueTargets.length > 0) {
            components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_synth_target').setPlaceholder('2. اختر العنصر المطلوب...').addOptions(uniqueTargets.slice(0, 25))));
        }

        if (state.targetItem) {
            const targetInfo = getItemInfo(state.targetItem);
            if(targetInfo) {
                payloadData.targetMatName = targetInfo.name;
                payloadData.targetMatIcon = targetInfo.iconUrl;
                
                const btnStyle = userMora >= SYNTHESIS_FEE ? ButtonStyle.Success : ButtonStyle.Secondary;
                components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('forge_execute_synth').setLabel(`دمــج`).setStyle(btnStyle).setEmoji('🔨').setDisabled(userMora < SYNTHESIS_FEE)
                ));
            }
        }
    }

    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'synthesis', payloadData, components, [], isInitial);
}

async function handleSynthesis(i, user, guildId, db, state) {
    if (!state.sacrificeItem || !state.targetItem) return;
    
    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=>({rows:[]}));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora || moraRes.rows[0].Mora) : 0;
    
    if (userMora < SYNTHESIS_FEE) {
        return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ لا تملك المورا الكافية للدمج (المطلوب: ${SYNTHESIS_FEE} 🪙).`)], components: [getReturnRow()] });
    }

    let invRes = await db.query(`SELECT "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=> db.query(`SELECT quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=>({rows:[]})));
    let sacQty = 0;
    if (invRes?.rows) invRes.rows.forEach(r => sacQty += Number(r.quantity || r.Quantity));

    if (sacQty < 4) return i.editReply({ files: [], embeds: [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك 4 حبات من العنصر المطلوب للتضحية.")], components: [getReturnRow()] });

    await db.query('BEGIN').catch(()=>{}); 
    try {
        await db.query(`UPDATE levels SET "mora" = GREATEST(CAST("mora" AS INTEGER) - $1, 0) WHERE "user" = $2 AND "guild" = $3`, [SYNTHESIS_FEE, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET mora = MAX(CAST(mora AS INTEGER) - $1, 0) WHERE userid = $2 AND guildid = $3`, [SYNTHESIS_FEE, user.id, guildId]));

        let remainingToDeduct = 4;
        let updateRes = await db.query(`SELECT "id", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.sacrificeItem]).catch(()=> db.query(`SELECT id, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.sacrificeItem]));
        for (const r of updateRes.rows) {
            if (remainingToDeduct <= 0) break;
            const q = Number(r.quantity || r.Quantity);
            const deduct = Math.min(q, remainingToDeduct);
            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [deduct, r.id || r.ID]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE id = $2`, [deduct, r.id || r.ID]));
            remainingToDeduct -= deduct;
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        
        let targetCheck = await db.query(`SELECT "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, state.targetItem]).catch(()=> db.query(`SELECT id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, state.targetItem]).catch(()=>({rows:[]})));
        if (targetCheck?.rows?.[0]) await db.query(`UPDATE user_inventory SET "quantity" = "quantity" + 1 WHERE "id" = $1`, [targetCheck.rows[0].id]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity + 1 WHERE id = $1`, [targetCheck.rows[0].id || targetCheck.rows[0].ID]));
        else await db.query(`INSERT INTO user_inventory ("guildID", "userID", "itemID", "quantity") VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]).catch(()=> db.query(`INSERT INTO user_inventory (guildid, userid, itemid, quantity) VALUES ($1, $2, $3, 1)`, [guildId, user.id, state.targetItem]));
        
        await db.query('COMMIT').catch(()=>{}); 
        
        const targetInfo = getItemInfo(state.targetItem);
        await replyWithCanvas(i, user, 'success_synthesis', {
            title: 'فرن الدمج السحري',
            targetMatName: targetInfo.name,
            targetMatIcon: targetInfo.iconUrl,
            targetMatRarity: targetInfo.rarity
        }, [getReturnRow()], []);
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        await i.editReply({ files: [], content: "❌ حدث خطأ أثناء الدمج!", embeds: [], components: [getReturnRow()] });
    }
}

// ------------------- الصهر (Smelting) -------------------
async function buildSmeltingUI(i, user, guildId, db, state, isInitial = false) {
    let invRes = await db.query(`SELECT "itemID", "quantity" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT itemid, quantity FROM user_inventory WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const inventory = aggregateInventory(invRes?.rows || []);

    const smeltableItems = inventory.filter(row => getItemInfo(row.itemID) !== null);

    if (smeltableItems.length === 0) return replyWithCanvas(i, user, 'main', { title: 'محرقة التفكيك العظمى' }, [getReturnRow()], [new EmbedBuilder().setColor(Colors.Red).setDescription("❌ لا تملك عناصر قابلة للصهر.")], isInitial);

    let moraRes = await db.query(`SELECT "mora" FROM levels WHERE "user" = $1 AND "guild" = $2`, [user.id, guildId]).catch(()=> db.query(`SELECT mora FROM levels WHERE userid = $1 AND guildid = $2`, [user.id, guildId]).catch(()=>({rows:[]})));
    const userMora = moraRes?.rows?.[0] ? Number(moraRes.rows[0].mora) : 0;

    let payloadData = { mora: userMora, title: 'محرقة التفكيك' };
    let components = [];

    if (!state.item) {
        const smeltOptions = smeltableItems.map(row => {
            const info = getItemInfo(row.itemID);
            const xpGain = SMELT_XP_RATES[info.rarity] || 0;
            return { label: info.name.substring(0, 100), value: info.id.substring(0, 100), description: `المخزون: ${row.quantity} | يعطي: ${xpGain} XP | الندرة: ${translateRarity(info.rarity)}`.substring(0, 100) };
        }).slice(0, 25);
        components.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('forge_smelt_select').setPlaceholder('اختر العنصر الذي تريد صهره...').addOptions(smeltOptions)));
    } else {
        const itemInfo = getItemInfo(state.item);
        if(!itemInfo) { state.item = null; return buildSmeltingUI(i, user, guildId, db, state, isInitial); }

        payloadData.sacMatName = itemInfo.name;
        payloadData.reqMatIcon = itemInfo.iconUrl;
        payloadData.xpGain = SMELT_XP_RATES[itemInfo.rarity] || 10;
        
        const rowData = smeltableItems.find(r => r.itemID === state.item);
        const itemQty = rowData ? rowData.quantity : 0;

        const actionRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('forge_execute_smelt_1').setLabel(`صـهـر`).setStyle(ButtonStyle.Danger)
        );

        if (itemQty > 1) {
            actionRow.addComponents(new ButtonBuilder().setCustomId(`forge_smelt_multi_${state.item}`).setLabel(`صـهـر متعـدد`).setStyle(ButtonStyle.Primary));
        }

        components.push(actionRow);
    }

    components.push(getReturnRow());
    return await replyWithCanvas(i, user, 'smelting', payloadData, components, [], isInitial);
}

async function handleSmeltingMultiModal(i, user, guildId, db, state, client) {
    const itemId = i.customId.replace('forge_smelt_multi_', '');
    const modal = new ModalBuilder().setCustomId(`modal_smelt_${itemId}`).setTitle('محرقة التفكيك - صهر متعدد');
    const input = new TextInputBuilder().setCustomId('smelt_qty').setLabel('كم حبة تبي تصهر؟').setStyle(TextInputStyle.Short).setRequired(true);
    modal.addComponents(new ActionRowBuilder().addComponents(input));
    await i.showModal(modal);
    
    try {
        const submit = await i.awaitModalSubmit({ time: 60000, filter: s => s.user.id === user.id });
        const qtyToSmelt = parseInt(submit.fields.getTextInputValue('smelt_qty'));
        if (isNaN(qtyToSmelt) || qtyToSmelt <= 0) return submit.reply({ content: '❌ رقم غير صالح.', flags: MessageFlags.Ephemeral });

        await handleSmelting(submit, user, guildId, db, state, client, qtyToSmelt, true);
    } catch(e) {}
}

async function handleSmelting(i, user, guildId, db, state, client, qtyToSmelt = 1, isModal = false) {
    const itemIdToSmelt = state.item || (isModal ? i.customId.replace('modal_smelt_', '') : null);
    if (!itemIdToSmelt) return;

    if (isModal) await i.deferUpdate().catch(()=>{});

    let invRes = await db.query(`SELECT "quantity", "id" FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2 AND "itemID" = $3`, [user.id, guildId, itemIdToSmelt]).catch(()=> db.query(`SELECT quantity, id FROM user_inventory WHERE userid = $1 AND guildid = $2 AND itemid = $3`, [user.id, guildId, itemIdToSmelt]).catch(()=>({rows:[]})));
    
    let totalQty = 0;
    if (invRes?.rows) invRes.rows.forEach(r => totalQty += Number(r.quantity || r.Quantity));

    if (totalQty < qtyToSmelt) {
        const errEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription(`❌ أنت لا تملك ${qtyToSmelt} حبة من هذا العنصر لصهره.`);
        return isModal ? i.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }) : i.editReply({ files: [], embeds: [errEmbed], components: [getReturnRow()] });
    }

    const itemInfo = getItemInfo(itemIdToSmelt);
    const xpReward = (SMELT_XP_RATES[itemInfo.rarity] || 10) * qtyToSmelt;

    await db.query('BEGIN').catch(()=>{}); 
    try {
        let remainingToDeduct = qtyToSmelt;
        for (const r of invRes.rows) {
            if (remainingToDeduct <= 0) break;
            const q = Number(r.quantity || r.Quantity);
            const deduct = Math.min(q, remainingToDeduct);
            await db.query(`UPDATE user_inventory SET "quantity" = "quantity" - $1 WHERE "id" = $2`, [deduct, r.id || r.ID]).catch(()=> db.query(`UPDATE user_inventory SET quantity = quantity - $1 WHERE id = $2`, [deduct, r.id || r.ID]));
            remainingToDeduct -= deduct;
        }

        await db.query(`DELETE FROM user_inventory WHERE "quantity" <= 0 AND "userID" = $1`, [user.id]).catch(()=> db.query(`DELETE FROM user_inventory WHERE quantity <= 0 AND userid = $1`, [user.id]));
        await db.query('COMMIT').catch(()=>{}); 

        const memberObj = await i.guild?.members?.fetch(user.id).catch(()=>{});
        if (addXPAndCheckLevel && memberObj) {
            await addXPAndCheckLevel(client, memberObj, db, xpReward, 0, false).catch(()=>{});
        } else {
            await db.query(`UPDATE levels SET "xp" = "xp" + $1, "totalXP" = "totalXP" + $1 WHERE "user" = $2 AND "guild" = $3`, [xpReward, user.id, guildId]).catch(()=> db.query(`UPDATE levels SET xp = xp + $1, totalxp = totalxp + $1 WHERE userid = $2 AND guildid = $3`, [xpReward, user.id, guildId]).catch(()=>{}));
            let cacheData = await client.getLevel(user.id, guildId);
            if(cacheData) { cacheData.xp += xpReward; cacheData.totalXP += xpReward; await client.setLevel(cacheData); }
        }
        
        const successData = {
            title: 'محرقة التفكيك',
            xpGain: xpReward
        };
        
        if (isModal) {
            await replyWithCanvas({
                replied: false, deferred: false,
                editReply: async (p) => i.editReply(p) 
            }, user, 'success_smelting', successData, [getReturnRow()], []);
            state.item = null;
        } else {
            await replyWithCanvas(i, user, 'success_smelting', successData, [getReturnRow()], []);
        }
    } catch (err) {
        await db.query('ROLLBACK').catch(()=>{});
        const errEmbed = new EmbedBuilder().setColor(Colors.Red).setDescription("❌ حدث خطأ أثناء الصهر!");
        isModal ? await i.followUp({ embeds: [errEmbed], flags: MessageFlags.Ephemeral }) : await i.editReply({ files: [], embeds: [errEmbed], components: [getReturnRow()] });
    }
}
