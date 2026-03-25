const { EmbedBuilder, SlashCommandBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require("discord.js");
const { calculateBuffMultiplier, calculateMoraBuff } = require("../handlers/streak-handler.js");
const { getUserRace, getWeaponData, cleanDisplayName } = require('../handlers/pvp-core.js'); 
const { generateAdventurerCard } = require('../generators/adventurer-card-generator.js');

// 🔥 استدعاء الـ Handlers الجديدة 🔥
const { getInventoryView, resolveItemInfo } = require('../handlers/inventory-handler.js');
const { getCombatView } = require('../handlers/combat-handler.js');

let calculateRequiredXP;
try {
    ({ calculateRequiredXP } = require('../handlers/handler-utils.js'));
} catch (e) {
    calculateRequiredXP = function(lvl) {
        if (lvl < 35) return 5 * (lvl ** 2) + (50 * lvl) + 100;
        return 15 * (lvl ** 2) + (150 * lvl);
    };
}

const TARGET_OWNER_ID = "1145327691772481577";
const EMOJI_MORA = '<:mora:1435647151349698621>';
const PROFILE_BASE_HP = 100;
const PROFILE_HP_PER_LEVEL = 4;

const RACE_TRANSLATIONS = new Map([
    ['Human', 'بشري'], ['Dragon', 'تنين'], ['Elf', 'آلف'], ['Dark Elf', 'آلف الظلام'],
    ['Seraphim', 'سيرافيم'], ['Demon', 'شيطان'], ['Vampire', 'مصاص دماء'],
    ['Spirit', 'روح'], ['Dwarf', 'قزم'], ['Ghoul', 'غول'], ['Hybrid', 'نصف وحش']
]);

function getRepRankInfo(points) {
    if (points >= 1000) return { name: '👑 رتبة SS', color: '#FF0055' }; 
    if (points >= 500)  return { name: '💎 رتبة S', color: '#9D00FF' }; 
    if (points >= 250)  return { name: '🥇 رتبة A', color: '#FFD700' }; 
    if (points >= 100)  return { name: '🥈 رتبة B', color: '#00FF88' }; 
    if (points >= 50)   return { name: '🥉 رتبة C', color: '#00BFFF' }; 
    if (points >= 25)   return { name: '⚔️ رتبة D', color: '#A9A9A9' }; 
    if (points >= 10)   return { name: '🛡️ رتبة E', color: '#B87333' }; 
    return { name: '🪵 رتبة F', color: '#654321' }; 
}

async function calculateStrongestRank(db, guildID, targetUserID) {
    if (targetUserID === TARGET_OWNER_ID) return 0;
    
    const weapons = db.prepare("SELECT userID, weaponLevel FROM user_weapons WHERE guildID = ? AND userID != ?").all(guildID, TARGET_OWNER_ID);
    const levels = db.prepare("SELECT user as userID, level FROM levels WHERE guild = ?").all(guildID);
    const levelsMap = new Map(levels.map(r => [r.userID, r.level]));
    const skills = db.prepare("SELECT userID, SUM(skillLevel) as totalLevels FROM user_skills WHERE guildID = ? GROUP BY userID").all(guildID);
    const skillsMap = new Map(skills.map(r => [r.userID, parseInt(r.totalLevels) || 0]));

    let stats = [];
    for (const w of weapons) {
        const playerLevel = levelsMap.get(w.userID) || 1;
        const hp = PROFILE_BASE_HP + (playerLevel * PROFILE_HP_PER_LEVEL);
        const skillLevelsTotal = skillsMap.get(w.userID) || 0;
        const powerScore = Math.floor((w.weaponLevel * 10) + (hp * 0.5) + (playerLevel * 10) + (skillLevelsTotal * 20));
        stats.push({ userID: w.userID, powerScore });
    }
    stats.sort((a, b) => b.powerScore - a.powerScore);
    return stats.findIndex(s => s.userID === targetUserID) + 1; 
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('بروفايل')
        .setDescription('المركز الرئيسي: يعرض البروفايل، الحقيبة، أو العتاد الخاص بك.')
        .addUserOption(option => 
            option.setName('user')
            .setDescription('المستخدم الذي تريد عرض بياناته (اختياري)')
            .setRequired(false))
        .addStringOption(option => 
            option.setName('tab')
            .setDescription('القسم الذي تود فتحه مباشرة (اختياري)')
            .setRequired(false)
            .addChoices(
                { name: '🪪 بطاقة البروفايل', value: 'profile' },
                { name: '🎒 الحقيبة', value: 'inventory' },
                { name: '⚔️ العتاد والمهارات', value: 'combat' }
            )),

    name: 'profile',
    aliases: ['p', 'بروفايل', 'بطاقة', 'كارد', 'card', 'inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة', 'مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'], 
    description: 'يعرض بطاقة المغامر أو الحقيبة أو العتاد الخاص بك.',

    async execute(interactionOrMessage, args) {
        const isSlash = !!interactionOrMessage.isChatInputCommand;
        let interaction, message, guild, client, authorUser, targetMember; 

        if (isSlash) {
            interaction = interactionOrMessage;
            guild = interaction.guild;
            client = interaction.client;
            authorUser = interaction.user; 
            targetMember = interaction.options.getMember('user') || interaction.member;
            await interaction.deferReply();
        } else {
            message = interactionOrMessage;
            guild = message.guild;
            client = message.client;
            authorUser = message.author; 
            targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || message.member;
        }

        const reply = async (payload) => {
            if (isSlash) return interaction.editReply(payload);
            else return message.channel.send(payload);
        };

        if (!targetMember || targetMember.user.bot) return reply({ content: "❌ لا يمكن عرض بيانات هذا العضو." });

        try {
            const db = client.sql; 
            const targetUser = targetMember.user; 
            const userId = targetUser.id;
            const guildId = guild.id;
            const isOwnProfile = userId === authorUser.id;
            const cleanName = cleanDisplayName(targetMember.displayName || targetUser.username);

            // =====================================
            // 📊 1. جلب البيانات الأساسية للـ Context
            // =====================================
            let levelData = db.prepare("SELECT xp, level, mora, bank FROM levels WHERE user = ? AND guild = ?").get(userId, guildId) || { xp: 0, level: 1, mora: 0, bank: 0 };
            const totalMora = Number(levelData.mora || 0) + Number(levelData.bank || 0);
            
            const userRaceData = await getUserRace(targetMember, db);
            const raceNameRaw = userRaceData ? userRaceData.raceName : null;
            const arabicRaceName = raceNameRaw ? (RACE_TRANSLATIONS.get(raceNameRaw) || raceNameRaw) : "مجهول";
            
            const weaponData = await getWeaponData(db, targetMember);
            const weaponName = weaponData ? weaponData.name : "بدون سلاح";

            const profileContext = {
                guildId, isOwnProfile, level: levelData.level, totalMora,
                raceNameRaw, arabicRaceName, weaponName, weaponData, userLevel: levelData.level
            };

            // =====================================
            // 🎮 2. توجيه العرض (Routing)
            // =====================================
            let currentView = 'profile'; 
            let invCategory = 'main';

            if (isSlash) {
                const chosenTab = interactionOrMessage.options.getString('tab');
                if (chosenTab) { currentView = chosenTab; if (chosenTab === 'inventory') invCategory = 'main'; }
            } else {
                const commandUsed = interactionOrMessage.content.slice(1).trim().split(/ +/)[0].toLowerCase();
                if (['inv', 'inventory', 'شنطة', 'اغراض', 'حقيبة'].includes(commandUsed)) { currentView = 'inventory'; invCategory = 'main'; }
                else if (['مهاراتي', 'skills', 'ms', 'عتاد', 'قدراتي'].includes(commandUsed)) { currentView = 'combat'; }
            }

            let invPage = 1; 
            let skillPage = 0;

            const getNavigationButtons = () => {
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`view_profile_${authorUser.id}`).setLabel('البروفايل').setEmoji('🪪').setStyle(currentView === 'profile' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_inventory_${authorUser.id}`).setLabel('الحقيبة').setEmoji('🎒').setStyle(currentView === 'inventory' ? ButtonStyle.Primary : ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`view_combat_${authorUser.id}`).setLabel('العتاد والمهارات').setEmoji('⚔️').setStyle(currentView === 'combat' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                );
            };

            const renderView = async () => {
                let viewData = { content: "", files: [], components: [] };

                if (currentView === 'profile') {
                    // حسابات البروفايل المعقدة تبقى هنا لأنها تخصه فقط
                    const repData = db.prepare("SELECT rep_points FROM user_reputation WHERE userID = ? AND guildID = ?").get(userId, guildId) || { rep_points: 0 };
                    const streakData = db.prepare("SELECT * FROM streaks WHERE guildID = ? AND userID = ?").get(guildId, userId) || {};
                    const xpBuffMultiplier = await calculateBuffMultiplier(targetMember, db);
                    const moraBuffMultiplier = await calculateMoraBuff(targetMember, db);

                    let ranks = { level: "0", mora: "0", streak: "0", power: "0" };
                    if (userId !== TARGET_OWNER_ID) {
                        ranks.level = (db.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY totalXP DESC").all(guildId, TARGET_OWNER_ID).findIndex(s => s.user === userId) + 1).toString();
                        ranks.mora = (db.prepare("SELECT user FROM levels WHERE guild = ? AND user != ? ORDER BY (CAST(COALESCE(mora, '0') AS INTEGER) + CAST(COALESCE(bank, '0') AS INTEGER)) DESC").all(guildId, TARGET_OWNER_ID).findIndex(s => s.user === userId) + 1).toString();
                        ranks.power = (await calculateStrongestRank(db, guildId, userId)).toString();
                    }

                    let displayMora = totalMora.toLocaleString();
                    if (userId === TARGET_OWNER_ID && authorUser.id !== TARGET_OWNER_ID) displayMora = "???";

                    const profData = {
                        user: targetUser, displayName: cleanName, rankInfo: getRepRankInfo(repData.rep_points || 0), repPoints: repData.rep_points || 0,
                        level: levelData.level, currentXP: Number(levelData.xp) || 0, requiredXP: calculateRequiredXP(levelData.level), mora: displayMora, raceName: arabicRaceName,
                        weaponName: weaponName, weaponDmg: weaponData ? weaponData.currentDamage : 0, maxHp: PROFILE_BASE_HP + (levelData.level * PROFILE_HP_PER_LEVEL), streakCount: streakData.streakCount || 0, xpBuff: Math.floor((xpBuffMultiplier - 1) * 100),
                        moraBuff: Math.floor((moraBuffMultiplier - 1) * 100), shields: Number(streakData.hasItemShield || 0) + Number(streakData.hasGracePeriod === 1 ? 1 : 0), ranks: ranks
                    };

                    const buffer = await generateAdventurerCard(profData);
                    viewData = { content: `**🪪 البطاقة الشخصية لـ ${cleanName}**`, files: [new AttachmentBuilder(buffer, { name: 'profile.png' })] };
                } 
                else if (currentView === 'combat') {
                    // سحب الواجهة من Combat Handler
                    viewData = await getCombatView(db, targetUser, cleanName, authorUser.id, skillPage, profileContext);
                }
                else if (currentView === 'inventory') {
                    // سحب الواجهة من Inventory Handler
                    viewData = await getInventoryView(db, targetUser, cleanName, authorUser.id, invCategory, invPage, profileContext);
                }

                // إضافة أزرار التنقل الرئيسية في أعلى أي شيء يعود من الهاندلرات
                viewData.components.unshift(getNavigationButtons());
                return viewData;
            };

            const msg = await reply(await renderView());
            const filter = i => i.user.id === authorUser.id && i.customId.includes(authorUser.id);
            const collector = msg.createMessageComponentCollector({ filter, time: 300000 });

            collector.on('collect', async (i) => {
                try { await i.deferUpdate(); } catch(e) { return; }
                const id = i.customId;

                if (id.startsWith('view_')) { currentView = id.split('_')[1]; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('cat_')) { invCategory = id.split('_')[1]; invPage = 1; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('inv_n_')) { invPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('inv_p_')) { invPage--; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_next_')) { skillPage++; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('sk_prev_')) { skillPage--; await msg.edit(await renderView()).catch(()=>{}); }
                else if (id.startsWith('trade_init_')) {
                    const inventory = db.prepare("SELECT itemID, quantity FROM user_inventory WHERE userID = ? AND guildID = ?").all(targetUser.id, guildId) || [];
                    const itemsInCat = inventory.map(row => { const info = resolveItemInfo(row.itemID); return {...info, id: row.itemID, quantity: row.quantity}; }).filter(i => i.category === (invCategory === 'others' ? 'others' : invCategory));
                    
                    const options = itemsInCat.slice(0, 25).map(item => ({ label: item.name, value: item.id, emoji: item.emoji || '📦', description: `الكمية المتاحة: ${item.quantity}` }));
                    const itemSelect = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade_item_${authorUser.id}`).setPlaceholder('اختر العنصر الذي تريد إرساله...').addOptions(options));
                    await i.editReply({ components: [itemSelect] }).catch(()=>{});
                }
                // بقية منطق التبادل يُعالج في interaction-handler أو هنا باستخدام Collector إضافي
            });

            collector.on('end', () => { try { msg.edit({ components: [] }).catch(()=>{}); } catch(e) {} });

        } catch (error) {
            console.error("Error in Hub command:", error);
            if (isSlash) await interaction.editReply({ content: "حدث خطأ أثناء تحميل البيانات." });
            else message.reply("حدث خطأ أثناء تحميل البيانات.");
        }
    }
};
