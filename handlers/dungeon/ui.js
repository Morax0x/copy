const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors } = require('discord.js');
const { OWNER_ID, skillsConfig, potionItems } = require('./constants');
const { ensureInventoryTable, buildHpBar } = require('./utils');

function buildSkillSelector(player) {
    const options = [];

    // --- تعديل: إزالة القائمة الخاصة بالأونر من هنا ---
    // لأن الأونر أصبح يستخدم زر "الدفاع" لفتح لوحة التحكم الشاملة.
    
    const cd = player.special_cooldown;
    const cdText = cd > 0 ? ` (كولداون: ${cd})` : '';
    
    let myClassSkill = null;
    // تعريب أسماء الكلاسات والمهارات
    if (player.class === 'Leader') myClassSkill = { name: "صرخة الحرب", desc: "زيادة ضرر الفريق 30%.", emoji: "👑" };
    else if (player.class === 'Tank') myClassSkill = { name: "استفزاز وتصليب", desc: "جذب الوحش وتقليل الضرر 60%.", emoji: "🛡️" };
    else if (player.class === 'Priest') myClassSkill = { name: "النور المقدس", desc: "شفاء الفريق أو إحياء ميت.", emoji: "✨" };
    else if (player.class === 'Mage') myClassSkill = { name: "سجن الجليد", desc: "تجميد الوحش.", emoji: "❄️" };
    else if (player.class === 'Summoner') myClassSkill = { name: "استدعاء حارس الظل", desc: "استدعاء وحش مساند.", emoji: "🐺" };

    if (myClassSkill) {
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(myClassSkill.name)
            .setValue('class_special_skill')
            .setDescription(`${myClassSkill.desc}${cdText}`)
            .setEmoji(myClassSkill.emoji));
    }

    const userSkills = player.skills || {};
    const availableSkills = Object.values(userSkills).filter(s => 
        (s.currentLevel > 0 || s.id.startsWith('race_')) && 
        s.stat_type !== 'Owner' // إخفاء مهارات الأونر من القائمة العادية
    );
    
    availableSkills.forEach(skill => {
        const cooldown = (player.id === OWNER_ID) ? 0 : (player.skillCooldowns[skill.id] || 0);
        const description = (cooldown > 0) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
        
        options.push(new StringSelectMenuOptionBuilder()
            .setLabel(skill.name)
            .setValue(skill.id)
            .setDescription(description.substring(0, 100))
            .setEmoji(skill.emoji || '✨'));
    });

    if (options.length === 0) return null;
    
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
        .setCustomId('skill_select_menu')
        .setPlaceholder('اختر مهارة لتفعيلها...')
        .addOptions(options.slice(0, 25))
    );
}

function buildPotionSelector(player, sql, guildID) {
    ensureInventoryTable(sql); 
    const userItems = sql.prepare("SELECT itemID, quantity FROM user_inventory WHERE userID = ? AND guildID = ?").all(player.id, guildID);
    
    const potions = userItems.map(ui => {
        const itemDef = potionItems.find(si => si.id === ui.itemID);
        if (itemDef) return { ...itemDef, quantity: ui.quantity };
        return null;
    }).filter(p => p !== null && p.quantity > 0);

    if (potions.length === 0) return null;

    const options = potions.map(p => {
        return new StringSelectMenuOptionBuilder()
            .setLabel(`${p.name} (x${p.quantity})`)
            .setValue(`use_potion_${p.id}`)
            .setDescription(p.description.substring(0, 90))
            .setEmoji(p.emoji);
    });

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('potion_select_menu')
            .setPlaceholder('اختر جرعة لشربها...')
            .addOptions(options.slice(0, 25))
    );
}

function generateBattleEmbed(players, monster, floor, theme, log, actedPlayers = [], color = '#2F3136') {
    const embed = new EmbedBuilder()
        .setTitle(`${theme.emoji} الطابق ${floor} | ضد ${monster.name}`)
        .setColor(color);

    let monsterStatus = "";
    if (monster.effects.some(e => e.type === 'poison')) monsterStatus += " ☠️";
    if (monster.effects.some(e => e.type === 'burn')) monsterStatus += " 🔥";
    if (monster.effects.some(e => e.type === 'weakness')) monsterStatus += " 📉";
    if (monster.effects.some(e => e.type === 'confusion')) monsterStatus += " 😵";
    if (monster.frozen) monsterStatus += " ❄️";

    const monsterBar = buildHpBar(monster.hp, monster.maxHp);
    embed.addFields({ 
        name: `👹 **${monster.name}** ${monsterStatus}`, 
        value: `${monsterBar} \`[${monster.hp}/${monster.maxHp}]\``, 
        inline: false 
    });

    let teamStatus = players.map(p => {
        let icon = p.isDead ? '💀' : (p.defending ? '🛡️' : '');
        let arabClass = p.class;
        
        // 🔥🔥 التعديل الجديد: دعم القائد السابق والجديد 🔥🔥
        if (p.class === 'Leader') { arabClass = 'القائد'; icon += '👑 '; }
        else if (p.class === 'Former Leader') { arabClass = 'قائد سابق'; icon += '🥀 '; }
        else if (p.class === 'Tank') { arabClass = 'مُدرّع'; icon += '🛡️ '; }
        else if (p.class === 'Priest') { arabClass = 'كاهن'; icon += '✨ '; }
        else if (p.class === 'Mage') { arabClass = 'ساحر'; icon += '🔮 '; }
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }
        else if (p.id === OWNER_ID) { arabClass = 'الإمبراطور'; icon += '👁️ '; } 

        const hpBar = p.isDead ? (p.isPermDead ? 'تحللت الجثة' : 'مـات') : buildHpBar(p.hp, p.maxHp, p.shield);
        let displayName;
        let statusCircle;

        if (p.isDead) {
            statusCircle = "💀";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else if (actedPlayers.includes(p.id)) {
            statusCircle = "🔴";
            displayName = `**${p.name}** [${arabClass}]`; 
        } else {
            statusCircle = "🟢";
            displayName = `<@${p.id}> [${arabClass}]`; 
        }

        return `${statusCircle} ${icon} ${displayName}\n${hpBar}`;
    }).join('\n\n');

    embed.addFields({ name: `🛡️ **فريق المغامرين**`, value: teamStatus, inline: false  });

    // ============================================================
    // 🛠️ التعديل هنا: عرض آخر 8 أسطر فقط (سجل متحرك)
    // ============================================================
    const logText = log.slice(-8).join('\n') || "بانتظار بدء الاشتباك...";
    
    embed.addFields({ name: "📜 آخر الأحداث:", value: logText, inline: false });

    return embed;
}

function generateBattleRows() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('atk').setLabel('هجوم').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('skill').setLabel('المهارات').setEmoji('✨').setStyle(ButtonStyle.Primary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('heal').setLabel('جرعة').setEmoji('🧪').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('def').setLabel('دفاع').setEmoji('🛡️').setStyle(ButtonStyle.Secondary)
    );

    return [row1, row2];
}

module.exports = {
    buildSkillSelector,
    buildPotionSelector,
    generateBattleEmbed,
    generateBattleRows
};
