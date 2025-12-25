const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, Colors } = require('discord.js');
const { OWNER_ID, skillsConfig, potionItems } = require('./constants');
const { ensureInventoryTable, buildHpBar } = require('./utils');

function buildSkillSelector(player) {
    const options = [];

    if (player.id === OWNER_ID) {
        options.push(new StringSelectMenuOptionBuilder().setLabel('تركيز تام').setValue('skill_secret_owner').setDescription('ضربة قاضية خاصة بالمالك.').setEmoji('👁️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('رحيل بصمت').setValue('skill_owner_leave').setDescription('ترك الوحش يحتضر والمغادرة.').setEmoji('🚪'));
        
        options.push(new StringSelectMenuOptionBuilder().setLabel('صرخة الحرب').setValue('class_leader').setDescription('زيادة ضرر الفريق 30%.').setEmoji('👑'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استفزاز وتصليب').setValue('class_tank').setDescription('جذب الوحش وتقليل الضرر 60%.').setEmoji('🛡️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('النور المقدس').setValue('class_priest').setDescription('شفاء الفريق أو إحياء ميت.').setEmoji('✨'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('سجن الجليد').setValue('class_mage').setDescription('تجميد الوحش.').setEmoji('❄️'));
        options.push(new StringSelectMenuOptionBuilder().setLabel('استدعاء حارس الظل').setValue('class_summoner').setDescription('استدعاء وحش مساند.').setEmoji('🐺'));

        skillsConfig.forEach(s => {
             if (!options.some(o => o.data.value === s.id)) {
                 options.push(new StringSelectMenuOptionBuilder().setLabel(s.name).setValue(s.id).setDescription(s.description ? s.description.substring(0, 90) : "مهارة").setEmoji(s.emoji || '📜'));
             }
        });

    } else {
        const cd = player.special_cooldown;
        const cdText = cd > 0 ? ` (كولداون: ${cd})` : '';
        
        let myClassSkill = null;
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
        const availableSkills = Object.values(userSkills).filter(s => s.currentLevel > 0 || s.id.startsWith('race_'));
        
        availableSkills.forEach(skill => {
            const cooldown = player.skillCooldowns[skill.id] || 0;
            const description = (cooldown > 0) ? `🕓 كولداون: ${cooldown} جولات` : `⚡ ${skill.description}`;
            options.push(new StringSelectMenuOptionBuilder()
                .setLabel(skill.name)
                .setValue(skill.id)
                .setDescription(description.substring(0, 100))
                .setEmoji(skill.emoji || '✨'));
        });
    }

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
        
        if (p.class === 'Leader') { arabClass = 'القائد'; icon += '👑'; }
        else if (p.class === 'Tank') arabClass = 'مُدرّع';
        else if (p.class === 'Priest') arabClass = 'كاهن';
        else if (p.class === 'Mage') arabClass = 'ساحر';
        else if (p.class === 'Summoner') { arabClass = 'مستدعٍ'; if(p.summon && p.summon.active) icon += '🐺'; }
        else if (p.class === '???') { arabClass = '؟؟؟'; icon += '👁️'; } 

        const hpBar = p.isDead ? (p.isPermDead ? 'تحللت الجثة' : 'MORT') : buildHpBar(p.hp, p.maxHp, p.shield);
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

    if (log.length > 0) {
        embed.addFields({ name: "سجل المعركة:", value: log.join('\n'), inline: false });
    }

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
