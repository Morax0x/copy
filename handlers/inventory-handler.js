const upgradeMats = require('../json/upgrade-materials.json');
let fishData = [], farmItems = [];
try { fishData = require('../json/fish.json'); } catch(e) {}
try { farmItems = require('../json/seeds.json').concat(require('../json/feed-items.json')); } catch(e) {}

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

function resolveItemInfo(itemId) {
    if (upgradeMats && upgradeMats.weapon_materials) {
        for (const race of upgradeMats.weapon_materials) {
            const mat = race.materials.find(m => m.id === itemId);
            if (mat) return { name: mat.name, emoji: mat.emoji, category: 'materials', rarity: mat.rarity, imgPath: `images/materials/${race.race.toLowerCase().replace(' ', '_')}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (upgradeMats && upgradeMats.skill_books) {
        for (const cat of upgradeMats.skill_books) {
            const book = cat.books.find(b => b.id === itemId);
            const typeFolder = cat.category === 'General_Skills' ? 'general' : 'race';
            if (book) return { name: book.name, emoji: book.emoji, category: 'materials', rarity: book.rarity, imgPath: `images/materials/${typeFolder}/${ID_TO_IMAGE[itemId] || itemId + '.png'}` };
        }
    }
    if (fishData && fishData.length > 0) {
        const fish = fishData.find(f => f.id === itemId || f.name === itemId);
        if (fish) return { name: fish.name, emoji: fish.emoji || '🐟', category: 'fishing', rarity: fish.rarity > 3 ? 'Epic' : 'Common', imgPath: null };
    }
    if (farmItems && farmItems.length > 0) {
        const farmObj = farmItems.find(f => f.id === itemId || f.name === itemId);
        if (farmObj) return { name: farmObj.name, emoji: farmObj.emoji || '🌾', category: 'farming', rarity: 'Common', imgPath: null };
    }
    return { name: itemId, emoji: '📦', category: 'others', rarity: 'Common', imgPath: null };
}

async function getInventoryCategories(db, userId, guildId) {
    let inventory = [];
    try {
        const invRes = await db.query(`SELECT * FROM user_inventory WHERE "userID" = $1 AND "guildID" = $2`, [userId, guildId]).catch(()=> db.query(`SELECT * FROM user_inventory WHERE userid = $1 AND guildid = $2`, [userId, guildId]));
        inventory = invRes?.rows || [];
    } catch (e) { }

    const categories = { materials: [], fishing: [], farming: [], others: [] };
    
    for (const row of inventory) {
        const itemId = row.itemID || row.itemid;
        const quantity = Number(row.quantity) || 0;
        if (quantity <= 0) continue;
        const itemInfo = resolveItemInfo(itemId);
        if (categories[itemInfo.category]) {
            categories[itemInfo.category].push({ ...itemInfo, quantity, id: itemId });
        } else {
            categories.others.push({ ...itemInfo, quantity, id: itemId });
        }
    }
    return categories;
}

module.exports = { resolveItemInfo, getInventoryCategories };
